import { getActiveResetCards, ResetCardSnapshot } from "./reset-cards";
import { RateLimitWindow } from "./usage";

const DAY_MS = 24 * 60 * 60 * 1000;
const RESERVE_PERCENT = 5;

export interface DailyAllowanceEstimate {
  remainingPercent: number;
  dailyPercent: number;
  daysUntilReset: number;
  targetResetAt: number;
  targetSource: "reset-card" | "official-weekly-reset";
  resetCardsIncomplete: boolean;
}

/**
 * Estimate an even daily spend from the remaining weekly quota, reserving 5%.
 * The target is the earlier of the next dated reset-card expiry and official
 * weekly reset. The user's local calendar dates define x - t, with a minimum
 * one day when the target is today to avoid division by zero.
 */
export function estimateDailyAllowance(
  weeklyWindow: RateLimitWindow | null,
  resetCards: ResetCardSnapshot | null,
  now = Date.now(),
): DailyAllowanceEstimate {
  if (!weeklyWindow) throw new Error("没有可用的官方每周额度数据");

  const remainingPercent = Math.max(0, Math.min(100, 100 - weeklyWindow.used_percent));
  const officialResetAt = weeklyWindow.reset_at * 1000;
  const candidates: Array<{
    timestamp: number;
    source: DailyAllowanceEstimate["targetSource"];
  }> = [];

  if (Number.isFinite(officialResetAt) && officialResetAt > now) {
    candidates.push({ timestamp: officialResetAt, source: "official-weekly-reset" });
  }

  // Use the nearest returned card as requested. If the backend capped card
  // details, surface that uncertainty in the notification instead of hiding
  // the known card expiry.
  const nearestCard = resetCards ? getActiveResetCards(resetCards, now)[0] : undefined;
  if (nearestCard && Number.isFinite(nearestCard.expiresAt) && nearestCard.expiresAt > now) {
    candidates.push({ timestamp: nearestCard.expiresAt, source: "reset-card" });
  }

  if (candidates.length === 0) throw new Error("没有找到未来的重置卡到期时间或官方每周重置时间");

  candidates.sort((a, b) => a.timestamp - b.timestamp);
  const target = candidates[0];
  const nowDate = new Date(now);
  const targetDate = new Date(target.timestamp);
  const today = Date.UTC(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const resetDay = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const daysUntilReset = Math.max(1, Math.ceil((resetDay - today) / DAY_MS));
  const spendablePercent = Math.max(0, remainingPercent - RESERVE_PERCENT);

  return {
    remainingPercent,
    dailyPercent: spendablePercent / daysUntilReset,
    daysUntilReset,
    targetResetAt: target.timestamp,
    targetSource: target.source,
    resetCardsIncomplete: resetCards?.hasMoreAvailableCredits ?? false,
  };
}

export const DAILY_ALLOWANCE_RESERVE_PERCENT = RESERVE_PERCENT;
