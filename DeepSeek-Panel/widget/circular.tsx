import { Gauge, Text } from "scripting";
import { Logo } from "./comp/header";
import { WidgetData } from "./small";

export function View({ total, granted }: WidgetData) {
  // 赠金占总余额的比例（0-100）
  const percent = total > 0 ? Math.round((granted / total) * 100) : 0;
  const size = 11;
  return (
    <Gauge
      gaugeStyle={"accessoryCircular"}
      min={0}
      max={100}
      value={percent}
      tint={"tertiaryLabel"}
      label={<Logo size={size} />}
      currentValueLabel={<Text>{`${percent}%`}</Text>}
    />
  );
}
