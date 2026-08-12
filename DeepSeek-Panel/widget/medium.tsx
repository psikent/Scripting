import { Divider, HStack, Spacer, Text, VStack } from "scripting";
import { Header } from "./comp/header";
import { currencySymbol, WidgetData } from "./small";

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <HStack font={"caption"} fontWeight={"semibold"}>
      <Text foregroundStyle={"secondaryLabel"}>{label}</Text>
      <Spacer />
      <Text foregroundStyle={highlight ? "systemRed" : "label"} monospacedDigit={true}>
        {value}
      </Text>
    </HStack>
  );
}

export function View({ currency, total, granted, toppedUp, spend }: WidgetData) {
  const symbol = currencySymbol(currency);
  return (
    <HStack padding={true} spacing={12}>
      <VStack alignment={"leading"} frame={{ maxWidth: "infinity" }}>
        <Header />
        <Spacer minLength={2} />
        <Text font={"caption"} foregroundStyle={"secondaryLabel"}>
          {"余额"}
        </Text>
        <Text
          font={"largeTitle"}
          fontWeight={"bold"}
          monospacedDigit={true}
          lineLimit={1}
          minScaleFactor={0.6}>
          {`${symbol}${total.toFixed(2)}`}
        </Text>
      </VStack>
      <Divider />
      <VStack spacing={6} frame={{ maxWidth: "infinity" }}>
        <StatRow
          label={"今日开销"}
          value={spend > 0 ? `-${symbol}${spend.toFixed(2)}` : `${symbol}0.00`}
          highlight={spend > 0}
        />
        <StatRow label={"赠金余额"} value={`${symbol}${granted.toFixed(2)}`} />
        <StatRow label={"充值余额"} value={`${symbol}${toppedUp.toFixed(2)}`} />
      </VStack>
    </HStack>
  );
}
