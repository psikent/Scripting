import { Notification, Script, Widget } from "scripting";
import { api } from "./class/api";

/**
 * 快捷指令定时任务入口：
 * 每天凌晨运行 → 拉取账户 → 更新当天开销基线（跨天重置）→ 强制刷新小组件
 * 运行结束后发送本地通知输出完成情况（可用余额 / 今日开销 / 失败原因）
 */
(async () => {
  try {
    if (!api.token) {
      await notify("ZCode 未刷新", "未配置 access_token，请在 Scripting 中打开脚本填写");
      Script.exit("未配置 access_token");
    }

    const account = await api.getAccount();
    const total = account.availableBalance;
    const spend = api.getTodaySpend(account.totalSpendAmount);
    const spendText = spend > 0 ? `¥${spend.toFixed(2)}` : "暂无开销";

    Widget.reloadUserWidgets();

    const summary = `可用余额 ¥${total.toFixed(2)} · 今日 ${spendText}`;
    await notify("ZCode 已刷新", summary);
    Script.exit(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notify("ZCode 刷新失败", msg);
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
