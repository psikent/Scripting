import { Button, Script, Widget } from "scripting";
import { ReloadIntent } from "./app_intents";
import { api } from "./class/api";
import { resolveRateLimitWindows } from "./class/usage";
import { ResetCardLoadState } from "./widget/small";
import { View as Circle } from "./widget/circular";
import { View as Small } from "./widget/small";

(async () => {
  if (!api.token) throw new Error("请填写 Token");

  switch (Widget.family) {
    case "accessoryCircular": {
      const { rate_limit } = await api.getUsage();
      const { fiveHour, weekly } = resolveRateLimitWindows(rate_limit);
      const primaryWindow = fiveHour ?? weekly;
      if (!primaryWindow) throw new Error("暂无可用的限额数据");
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Circle remainingPercent={100 - primaryWindow.used_percent} />
        </Button>,
      );
      break;
    }
    case "systemSmall": {
      let weekly = null;
      try {
        const { rate_limit } = await api.getUsage();
        weekly = resolveRateLimitWindows(rate_limit).weekly;
      } catch {
        // Quota data and reset-credit data are independent for the small widget.
      }

      let resetCards: ResetCardLoadState;
      try {
        resetCards = { kind: "success", snapshot: await api.getResetCards() };
      } catch {
        resetCards = { kind: "failure" };
      }

      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Small weekly={weekly} resetCards={resetCards} />
        </Button>,
      );
      break;
    }
    default:
      throw new Error("未适配的 Widget 尺寸");
  }
})().catch(async (e) => {
  const { Text } = await import("scripting");
  const message = e instanceof Error && e.message === "请填写 Token"
    ? e.message
    : "加载小组件失败";
  Widget.present(<Text>{message}</Text>);
}).finally(() => Script.exit());
