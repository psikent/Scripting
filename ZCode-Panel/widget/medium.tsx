import { BarChart, Chart, HStack, Spacer, Text, VStack } from "scripting";
import { Header } from "./comp/header";
import { WidgetData } from "./small";

export function View({ total, spend, weekly, average }: WidgetData) {
  const marks = weekly.map((d) => {
    const color: "systemRed" | "systemBlue" =
      d.value > average ? "systemRed" : "systemBlue";
    return {
      label: d.label,
      value: d.value,
      foregroundStyle: color,
      cornerRadius: 3,
    };
  });
  return (
    <HStack padding={true} spacing={12}>
      <VStack alignment={"leading"} frame={{ maxWidth: "infinity" }}>
        <Header />
        <Spacer minLength={4} />
        <Text font={"caption"} foregroundStyle={"secondaryLabel"}>
          {"可用余额"}
        </Text>
        <Text
          font={"title2"}
          fontWeight={"bold"}
          monospacedDigit={true}
          lineLimit={1}
          minScaleFactor={0.6}>
          {`¥${total.toFixed(2)}`}
        </Text>
        <Spacer minLength={4} />
        <Text font={"caption"} foregroundStyle={"secondaryLabel"}>
          {"今日开销"}
        </Text>
        <Text
          font={"title2"}
          fontWeight={"bold"}
          monospacedDigit={true}
          foregroundStyle={spend > 0 ? "systemRed" : "secondaryLabel"}>
          {spend > 0 ? `-¥${spend.toFixed(2)}` : "¥0.00"}
        </Text>
      </VStack>
      <Chart frame={{ maxWidth: "infinity", maxHeight: "infinity" }} chartYAxis="hidden">
        <BarChart labelOnYAxis={false} marks={marks} />
      </Chart>
    </HStack>
  );
}
