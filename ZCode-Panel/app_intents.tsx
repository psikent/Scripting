import { AppIntentManager, AppIntentProtocol, Script, Widget } from "scripting";
import { api } from "./class/api";

export const ReloadIntent = AppIntentManager.register({
  name: Script.name,
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    // 主动拉取账户并更新当天开销基线（跨天自动重置），
    // 使点击刷新/定时任务都能在 widget 重渲染前完成基线更新
    try {
      if (api.token) {
        const account = await api.getAccount();
        api.getTodaySpend(account.totalSpendAmount);
      }
    } catch {
      // 网络失败不阻塞刷新，小组件会显示上次数据或错误
    }
    Widget.reloadUserWidgets();
  },
});
