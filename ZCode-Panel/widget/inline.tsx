import { Text } from "scripting";
import { WidgetData } from "./small";

export function View({ total, spend }: WidgetData) {
  const spendText =
    spend > 0 ? `今日 -¥${spend.toFixed(2)}` : "今日 ¥0.00";
  return (
    <Text font={"subheadline"} fontWeight={"semibold"} monospacedDigit={true} lineLimit={1}>
      {`ZCode ¥${total.toFixed(2)} · ${spendText}`}
    </Text>
  );
}
