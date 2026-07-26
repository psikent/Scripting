import { Button, Widget } from "scripting";
import { ReloadIntent } from "./app_intents";
import { api } from "./class/api";
import { View as Circle } from "./widget/circular";
import { View as Small } from "./widget/small";

(async () => {
  if (!api.token) throw new Error("请填写 Token");
  const { email, rate_limit } = await api.getUsage();

  switch (Widget.family) {
    case "accessoryCircular":
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Circle percent={rate_limit.primary_window.used_percent} />
        </Button>,
      );
      break;
    case "systemSmall":
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Small
            email={email}
            percent={rate_limit.primary_window.used_percent}
            reset={rate_limit.primary_window.reset_at}
            // widgetBackground={{
            //   gradient: true,
            //   color: "systemBackground",
            //   opacity: 0.5,
            // }}
          />
        </Button>,
      );
      break;
    default:
      throw new Error("未适配的 Widget 尺寸");
  }
})().catch(async (e) => {
  const { Text } = await import("scripting");
  Widget.present(<Text>{String(e)}</Text>);
});