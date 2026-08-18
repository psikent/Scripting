import { Notification, Script, Widget } from "scripting";
import { api } from "./class/api";

/**
 * 快捷指令定时任务入口：
 * - 每天凌晨运行 → 拉取余额 → 更新当天开销基线（跨天重置）→ 刷新小组件
 * - 每天 21:30 运行 → 拉取余额 → 计算当天累计开销并推送播报通知
 * 根据当前小时自动区分：0–6 点为“刷新”静默通知，其余时间为“今日开销”提醒通知。
 */
(async () => {
  const hour = new Date().getHours();
  const midnight = hour >= 0 && hour < 6;

  try {
    if (!api.token) {
      await notify("DeepSeek 未刷新", "未配置 API Key，请在 Scripting 中打开脚本填写", midnight);
      Script.exit("未配置 API Key");
    }

    const data = await api.getBalance();
    if (!data.is_available) throw new Error("账户余额不可用");
    const info = data.balance_infos?.[0];
    if (!info) throw new Error("未获取到余额信息");

    const total = parseFloat(info.total_balance) || 0;
    const spend = api.getTodaySpend(total);
    const symbol = info.currency === "CNY" ? "¥" : "$";
    const spendText = spend > 0 ? `${symbol}${spend.toFixed(2)}` : "暂无开销";

    Widget.reloadUserWidgets();

    const title = midnight ? "DeepSeek 已刷新" : "DeepSeek 今日开销";
    const body = midnight
      ? `余额 ${symbol}${total.toFixed(2)} · 今日 ${spendText}`
      : `${spendText} · 余额 ${symbol}${total.toFixed(2)}`;

    await notify(title, body, midnight);
    Script.exit(`${title}｜${body}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notify("DeepSeek 刷新失败", msg, midnight);
    Script.exit(`刷新失败: ${msg}`);
  }
})();

function notify(title: string, body: string, silent: boolean) {
  return Notification.schedule({
    title,
    body,
    silent,
    // 点击通知打开面板页面查看余额与近 7 天开销
    tapAction: { type: "openURL", url: Script.createOpenURLScheme(Script.name) },
  });
}
