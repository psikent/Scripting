import { Button, Script, Widget } from "scripting";
import { ReloadIntent } from "./app_intents";
import { api } from "./class/api";
import { resolveRateLimitWindows } from "./class/usage";
import { View as Circle } from "./widget/circular";
import { View as Small } from "./widget/small";

(async () => {
  if (!api.token) throw new Error("请填写 Token");
  const { email, rate_limit } = await api.getUsage();
  const { fiveHour, weekly } = resolveRateLimitWindows(rate_limit);
  const primaryWindow = fiveHour ?? weekly;
  if (!primaryWindow) throw new Error("暂无可用的限额数据");

  switch (Widget.family) {
    case "accessoryCircular":
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Circle remainingPercent={100 - primaryWindow.used_percent} />
        </Button>,
      );
      break;
    case "systemSmall":
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Small email={email} fiveHour={fiveHour} weekly={weekly} />
        </Button>,
      );
      break;
    default:
      throw new Error("未适配的 Widget 尺寸");
  }
})().catch(async (e) => {
  const { Text } = await import("scripting");
  Widget.present(<Text>{String(e)}</Text>);
}).finally(() => Script.exit());
