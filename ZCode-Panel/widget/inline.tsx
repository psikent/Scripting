import { Text } from "scripting";
import { formatPercentage, WidgetData } from "./small";

export function View({ rolling, weekly }: WidgetData) {
  const rollingText = rolling ? `${formatPercentage(rolling.percentage)}%` : "—";
  const weeklyText = weekly ? `${formatPercentage(weekly.percentage)}%` : "—";
  return (
    <Text font={"subheadline"} fontWeight={"semibold"} monospacedDigit={true} lineLimit={1}>
      {`ZCode · 5小时 ${rollingText} · 周 ${weeklyText}`}
    </Text>
  );
}
