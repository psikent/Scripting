import { Button, Widget } from "scripting";
import { ReloadIntent } from "./app_intents";
import { api } from "./class/api";
import { View as Circle } from "./widget/circular";
import { View as Small } from "./widget/small";

(async () => {
  if (!api.token) throw new Error("请先在设置页填写 API Key");
  const data = await api.goUsage();

  switch (Widget.family) {
    case "accessoryCircular":
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Circle percent={data.usage.weekly.percent} />
        </Button>,
      );
      break;
    case "systemSmall":
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Small usage={data.usage} />
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
