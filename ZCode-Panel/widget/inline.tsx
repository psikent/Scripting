import { Text } from "scripting";
import { formatRemaining, formatPercentage, WidgetData } from "./small";

export function View({ rolling, weekly }: WidgetData) {
  const rollingText = rolling ? formatRemaining(rolling, true) : "—";
  const weeklyText = weekly ? formatRemaining(weekly, true) : "—";
  return (
    <Text font={"subheadline"} fontWeight={"semibold"} monospacedDigit={true} lineLimit={1}>
      {`ZCode · 5小时剩余 ${rollingText} · 周剩余 ${weeklyText}`}
    </Text>
  );
}
