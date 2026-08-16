import { Divider, HStack, Spacer, Text, VStack } from "scripting";
import { DailySpend } from "../class/api";
import { Header } from "./comp/header";

export interface WidgetData {
  /** 可用余额 */
  total: number;
  /** 总余额 */
  balance: number;
  /** 累计充值 */
  recharge: number;
  /** 累计赠送 */
  granted: number;
  /** 今日开销 */
  spend: number;
  /** 累计消费 */
  totalSpend: number;
  /** 最近 7 天每日开销（含今天，从最旧到最新） */
  weekly: DailySpend[];
  /** 7 日平均开销 */
  average: number;
}

/** 智谱国内站以人民币计费 */
export const currencySymbol = () => "¥";

export function View({ total, spend }: WidgetData) {
  return (
    <VStack padding={true} alignment={"leading"}>
      <Header />
      <Divider />
      <Text
        font={"caption"}
        foregroundStyle={"secondaryLabel"}
        padding={{ top: 5, bottom: 2 }}>
        {"可用余额"}
      </Text>
      <Text
        font={"largeTitle"}
        fontWeight={"bold"}
        monospacedDigit={true}
        lineLimit={1}
        minScaleFactor={0.6}>
        {`¥${total.toFixed(2)}`}
      </Text>
      <Spacer minLength={4} />
      <HStack font={"caption"} fontWeight={"semibold"}>
        <Text foregroundStyle={"secondaryLabel"}>{"今日开销"}</Text>
        <Spacer />
        <Text
          foregroundStyle={spend > 0 ? "systemRed" : "secondaryLabel"}
          monospacedDigit={true}>
          {spend > 0 ? `-¥${spend.toFixed(2)}` : "¥0.00"}
        </Text>
      </HStack>
    </VStack>
  );
}
