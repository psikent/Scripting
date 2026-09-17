import { Gauge, Text } from "scripting";
import { PackageUsageWindow } from "../class/api";
import { getRemainingPercentage } from "./small";
import { Logo } from "./comp/header";

export function View({ window }: { window: PackageUsageWindow | null }) {
  const size = 11;
  const percentage = getRemainingPercentage(window);
  return (
    <Gauge
      gaugeStyle={"accessoryCircular"}
      min={0}
      max={100}
      value={percentage}
      tint={percentage <= 10 ? "systemRed" : "tertiaryLabel"}
      label={<Logo size={size} />}
      currentValueLabel={<Text>{`${Math.round(percentage)}%`}</Text>}
    />
  );
}
