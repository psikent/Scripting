export interface ResetCard {
  /** Unix timestamp in milliseconds, only when the API provides a valid expiry. */
  expiresAt: number;
}

export interface ResetCardSnapshot {
  /** Authoritative available-credit count reported by the backend. */
  availableCount: number;
  /** Available, dated cards; detail rows can be capped by the backend. */
  cards: ResetCard[];
  /** True when the backend reported more available credits than returned detail rows. */
  hasMoreAvailableCredits: boolean;
}

export type ResetCardUrgency = "normal" | "warning" | "critical";

const RESET_TYPE = "codex_rate_limits";
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** Parse the documented reset-credit payload; unsupported row contracts fail safely. */
export function parseResetCardSnapshot(payload: unknown): ResetCardSnapshot {
  if (!isRecord(payload)) throw new Error("重置卡响应格式无效");

  const availableCount = payload.available_count;
  if (
    typeof availableCount !== "number" ||
    !Number.isSafeInteger(availableCount) ||
    availableCount < 0
  ) {
    throw new Error("重置卡数量格式无效");
  }
  if (!Array.isArray(payload.credits)) throw new Error("重置卡详情格式无效");

  const cards: ResetCard[] = [];
  let returnedAvailableCount = 0;

  for (const credit of payload.credits) {
    if (!isRecord(credit) || typeof credit.status !== "string") {
      throw new Error("重置卡详情格式无效");
    }

    if (credit.status === "redeemed" || credit.status === "redeeming") continue;
    if (credit.status !== "available") {
      throw new Error("重置卡状态暂不支持");
    }

    returnedAvailableCount += 1;
    if (credit.reset_type !== RESET_TYPE) {
      throw new Error("重置卡类型暂不支持");
    }

    // Null is documented as non-expiring, but ticket 01 only ranks dated cards.
    // Defer no-expiry UI semantics to the separate unknown-expiry ticket.
    const expiresAt = parseExpiry(credit.expires_at);
    if (expiresAt === null) throw new Error("重置卡缺少有效到期时间");
    cards.push({ expiresAt });
  }

  if (returnedAvailableCount > availableCount) {
    throw new Error("重置卡数量与详情不一致");
  }

  return {
    availableCount,
    cards,
    hasMoreAvailableCredits: returnedAvailableCount < availableCount,
  };
}

/** Keep only unexpired dated cards and order them by the soonest expiry. */
export function getActiveResetCards(snapshot: ResetCardSnapshot, now: number): ResetCard[] {
  return snapshot.cards
    .filter((card) => card.expiresAt > now)
    .slice()
    .sort((a, b) => a.expiresAt - b.expiresAt);
}

export function selectUpcomingResetCards(
  snapshot: ResetCardSnapshot,
  now: number,
  limit = 2,
): ResetCard[] {
  return getActiveResetCards(snapshot, now).slice(0, Math.max(0, limit));
}

/** Recomputed during rendering so urgency follows the current device clock. */
export function getResetCardUrgency(expiresAt: number, now: number): ResetCardUrgency {
  const remaining = expiresAt - now;
  if (remaining <= ONE_HOUR_MS) return "critical";
  if (remaining <= ONE_DAY_MS) return "warning";
  return "normal";
}

function parseExpiry(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/,
  );
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText ?? 0);
  const offsetMinute = Number(offsetMinuteText ?? 0);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (
    month < 1 || month > 12 || day < 1 || day > daysInMonth ||
    hour > 23 || minute > 59 || second > 59 ||
    offsetHour > 23 || offsetMinute > 59
  ) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
