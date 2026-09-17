import { Divider, HStack, Spacer, Text, VStack } from "scripting";
import { Header } from "./comp/header";
import {
  formatPercentage,
  formatPlanLevel,
  formatRemaining,
  formatResetTime,
  getRemainingPercentage,
  UsageProgress,
  WidgetData,
} from "./small";

export function View({ level, rolling, weekly }: WidgetData) {
  return (
    <VStack padding={true} alignment="leading" spacing={7}>
      <Header detail={formatPlanLevel(level)} />
      <Divider />
      <MediumUsageRow label="5 小时额度" window={rolling} />
      <MediumUsageRow label="每周额度" window={weekly} />
    </VStack>
  );
}

function MediumUsageRow({
  label,
  window,
}: {
  label: string;
  window: WidgetData["rolling"];
}) {
  const remainingPercentage = getRemainingPercentage(window);
  const warning = remainingPercentage <= 10;
  const resetText = window?.resetAt ? `重置 ${formatResetTime(window.resetAt)}` : "";
  return (
    <VStack alignment="leading" spacing={3}>
      <HStack frame={{ maxWidth: "infinity" }}>
        <Text font="caption" fontWeight="semibold" foregroundStyle="secondaryLabel">
          {label}
        </Text>
        <Spacer />
        <Text
          font="headline"
          fontWeight="bold"
          monospacedDigit={true}
          foregroundStyle={warning ? "systemRed" : "label"}>
          {window ? `剩余 ${formatPercentage(remainingPercentage)}%` : "—"}
        </Text>
      </HStack>
      <UsageProgress
        percentage={remainingPercentage}
        color={warning ? "systemRed" : "tintColor"}
        height={9}
      />
      <HStack frame={{ maxWidth: "infinity" }} font="caption" foregroundStyle="secondaryLabel">
        <Text monospacedDigit={true} lineLimit={1}>
          {window ? formatRemaining(window) : "暂无数据"}
        </Text>
        <Spacer minLength={6} />
        <Text monospacedDigit={true} lineLimit={1}>
          {resetText}
        </Text>
      </HStack>
    </VStack>
  );
}
