import { Text } from "scripting";
import { currencySymbol, WidgetData } from "./small";

export function View({ currency, total, spend }: WidgetData) {
  const symbol = currencySymbol(currency);
  const spendText =
    spend > 0 ? `今日 -${symbol}${spend.toFixed(2)}` : `今日 ${symbol}0.00`;
  return (
    <Text font={"subheadline"} fontWeight={"semibold"} monospacedDigit={true} lineLimit={1}>
      {`DeepSeek ${symbol}${total.toFixed(2)} · ${spendText}`}
    </Text>
  );
}
