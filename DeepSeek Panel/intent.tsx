import { Notification, Script, Widget } from "scripting";
import { api } from "./class/api";

/**
 * 快捷指令定时任务入口：
 * 每天凌晨运行 → 拉取余额 → 更新当天开销基线（跨天重置）→ 强制刷新小组件
 * 运行结束后发送本地通知输出完成情况（余额 / 今日开销 / 失败原因）
 */
(async () => {
  try {
    if (!api.token) {
      await notify("DeepSeek 未刷新", "未配置 API Key，请在 Scripting 中打开脚本填写");
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

    const summary = `余额 ${symbol}${total.toFixed(2)} · 今日 ${spendText}`;
    await notify("DeepSeek 已刷新", summary);
    Script.exit(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notify("DeepSeek 刷新失败", msg);
    Script.exit(`刷新失败: ${msg}`);
  }
})();

function notify(title: string, body: string) {
  return Notification.schedule({
    title,
    body,
    silent: true,
    tapAction: "none",
  });
}
