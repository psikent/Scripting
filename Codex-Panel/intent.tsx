import { Intent, Notification, Script } from "scripting";
import { api } from "./class/api";
import { estimateDailyAllowance } from "./class/daily-allowance";
import { resolveRateLimitWindows } from "./class/usage";

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

async function run() {
  if (!api.token) {
    Script.exit(Intent.text("额度评估失败：请先在 Codex Panel 中设置并保存 Token。"));
    return;
  }

  try {
    const usage = await api.getUsage();
    const windows = resolveRateLimitWindows(usage?.rate_limit);
    if (!windows.weekly) throw new Error("未获取到官方每周额度数据");

    let resetCards = null;
    let resetCardWarning = "";
    try {
      resetCards = await api.getResetCards();
    } catch (error) {
      resetCardWarning = `重置卡数据不可用（${String(error)}），本次仅按官方重置时间估算。`;
    }

    const estimate = estimateDailyAllowance(windows.weekly, resetCards, Date.now());
    const targetDescription = estimate.targetSource === "reset-card"
      ? "最早重置卡到期"
      : "官方每周重置";
    const equation = `(${formatPercent(estimate.remainingPercent)} − 5%) ÷ ${estimate.daysUntilReset} 天 = ${formatPercent(estimate.dailyPercent)}/天`;
    const notes = [
      resetCardWarning,
      estimate.resetCardsIncomplete
        ? "重置卡详情不完整，可能存在更早到期但未返回的卡片。"
        : "",
    ].filter(Boolean);
    const body = [
      `当前每周剩余额度：${formatPercent(estimate.remainingPercent)}`,
      `目标：${targetDescription}（${formatDate(estimate.targetResetAt)}）`,
      `每日建议：${equation}`,
      "已预留 5% 额度。",
      ...notes,
    ].join("\n");

    const delivered = await Notification.schedule({
      title: "Codex 每日额度建议",
      body,
      trigger: null,
      threadIdentifier: "codex-daily-allowance",
      interruptionLevel: "active",
      tapAction: "none",
    });

    const result = delivered
      ? `已推送额度评估。\n${body}`
      : `额度评估已完成，但通知未能发送。请检查 Scripting 的通知权限。\n${body}`;
    Script.exit(Intent.text(result));
  } catch (error) {
    Script.exit(Intent.text(`Codex 额度评估失败：${String(error)}`));
  }
}

run();
