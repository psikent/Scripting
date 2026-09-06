import { Gauge, Text } from "scripting";
import { Logo } from "./comp/header";

export function View({ percentage }: { percentage: number }) {
  const size = 11;
  return (
    <Gauge
      gaugeStyle={"accessoryCircular"}
      min={0}
      max={100}
      value={percentage}
      tint={percentage >= 100 ? "systemRed" : "tertiaryLabel"}
      label={<Logo size={size} />}
      currentValueLabel={<Text>{`${Math.round(percentage)}%`}</Text>}
    />
  );
}
