import { AppIntentManager, AppIntentProtocol, Script, Widget } from "scripting";
import { api } from "./class/api";

export const ReloadIntent = AppIntentManager.register({
  name: Script.name,
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    // 主动拉取余额并更新当天开销基线（跨天自动重置），
    // 使凌晨定时任务/点击刷新都能在 widget 重渲染前完成基线更新
    try {
      if (api.token) {
        const data = await api.getBalance();
        const info = data?.balance_infos?.[0];
        if (info) {
          const total = parseFloat(info.total_balance) || 0;
          api.getTodaySpend(total);
        }
      }
    } catch {
      // 网络失败不阻塞刷新，小组件会显示上次数据或错误
    }
    Widget.reloadUserWidgets();
  },
});
