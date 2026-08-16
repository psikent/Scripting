import { Button, Widget } from "scripting";
import { ReloadIntent } from "./app_intents";
import { api } from "./class/api";
import { View as Small, WidgetData } from "./widget/small";
import { View as Medium } from "./widget/medium";
import { View as Circular } from "./widget/circular";
import { View as Inline } from "./widget/inline";

(async () => {
  if (!api.token) throw new Error("请填写 access_token");

  const account = await api.getAccount();
  const spend = api.getTodaySpend(account.totalSpendAmount);
  const { weekly, average } = api.getWeeklySpend();
  const props: WidgetData = {
    total: account.availableBalance,
    balance: account.balance,
    recharge: account.rechargeAmount,
    granted: account.giveAmount,
    spend,
    totalSpend: account.totalSpendAmount,
    weekly,
    average,
  };

  const reloadButton = (node: JSX.Element) => (
    <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
      {node}
    </Button>
  );

  switch (Widget.family) {
    case "accessoryCircular":
      Widget.present(reloadButton(<Circular {...props} />));
      break;
    case "accessoryInline":
    case "accessoryRectangular":
      Widget.present(reloadButton(<Inline {...props} />));
      break;
    case "systemSmall":
      Widget.present(reloadButton(<Small {...props} />));
      break;
    case "systemMedium":
    case "systemLarge":
    case "systemExtraLarge":
      Widget.present(reloadButton(<Medium {...props} />));
      break;
    default:
      throw new Error("未适配的 Widget 尺寸");
  }
})().catch(async (e) => {
  const { Text } = await import("scripting");
  Widget.present(<Text>{String(e)}</Text>);
});
