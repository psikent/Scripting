import { Divider, HStack, Spacer, Text, VStack } from "scripting";
import { DailySpend } from "../class/api";
import { Header } from "./comp/header";

export interface WidgetData {
  currency: string;
  total: number;
  granted: number;
  toppedUp: number;
  spend: number;
  /** 最近 7 天每日开销（含今天，从最旧到最新） */
  weekly: DailySpend[];
  /** 7 日平均开销（基线） */
  average: number;
}

export function currencySymbol(currency: string): string {
  return currency === "CNY" ? "¥" : "$";
}

export function View({ currency, total, spend }: WidgetData) {
  const symbol = currencySymbol(currency);
  return (
    <VStack padding={true} alignment={"leading"}>
      <Header />
      <Divider />
      <Text
        font={"caption"}
        foregroundStyle={"secondaryLabel"}
        padding={{ top: 5, bottom: 2 }}>
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
      <Spacer minLength={4} />
      <HStack font={"caption"} fontWeight={"semibold"}>
        <Text foregroundStyle={"secondaryLabel"}>{"今日开销"}</Text>
        <Spacer />
        <Text
          foregroundStyle={spend > 0 ? "systemRed" : "secondaryLabel"}
          monospacedDigit={true}>
          {spend > 0 ? `-${symbol}${spend.toFixed(2)}` : `${symbol}0.00`}
        </Text>
      </HStack>
    </VStack>
  );
}
