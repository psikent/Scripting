import { Button, Widget } from "scripting";
import { ReloadIntent } from "./app_intents";
import { api } from "./class/api";
import { View as Small, WidgetData } from "./widget/small";
import { View as Medium } from "./widget/medium";
import { View as Circular } from "./widget/circular";
import { View as Inline } from "./widget/inline";

(async () => {
  if (!api.token) throw new Error("请填写 Token");

  const data = await api.getBalance();
  if (!data.is_available) throw new Error("账户余额不可用");
  const info = data.balance_infos[0];
  if (!info) throw new Error("未获取到余额信息");

  const total = parseFloat(info.total_balance) || 0;
  const spend = api.getTodaySpend(total);
  const { weekly, average } = api.getWeeklySpend();
  const props: WidgetData = {
    currency: info.currency,
    total,
    granted: parseFloat(info.granted_balance) || 0,
    toppedUp: parseFloat(info.topped_up_balance) || 0,
    spend,
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
