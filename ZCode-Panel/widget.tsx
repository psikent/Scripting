import { Button, Widget } from "scripting";
import { ReloadIntent } from "./app_intents";
import { api } from "./class/api";
import { View as Small, WidgetData } from "./widget/small";
import { View as Medium } from "./widget/medium";
import { View as Circular } from "./widget/circular";
import { View as Inline } from "./widget/inline";

(async () => {
  if (!api.codingPlanKey) throw new Error("请填写 Coding Plan API Key");

  const usage = await api.getPackageUsage();
  const props: WidgetData = {
    level: usage.level,
    rolling: usage.rolling,
    weekly: usage.weekly,
  };

  const reloadButton = (node: JSX.Element) => (
    <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
      {node}
    </Button>
  );

  switch (Widget.family) {
    case "accessoryCircular":
      Widget.present(reloadButton(<Circular percentage={props.weekly?.percentage ?? 0} />));
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
