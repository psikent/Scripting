import { Divider, HStack, Rectangle, Spacer, Text, VStack, ZStack } from "scripting";
import { PackageUsageWindow } from "../class/api";
import { Header } from "./comp/header";

export interface WidgetData {
  /** 套餐等级，如 lite / pro / max */
  level: string;
  /** 5 小时滚动额度 */
  rolling: PackageUsageWindow | null;
  /** 每周额度 */
  weekly: PackageUsageWindow | null;
}

export function View({ level, rolling, weekly }: WidgetData) {
  return (
    <VStack padding={12} alignment={"leading"}>
      <Header detail={formatPlanLevel(level)} />
      <Divider />
      <UsageRow label="5 小时" window={rolling} />
      <UsageRow label="1 周" window={weekly} />
    </VStack>
  );
}

export function UsageRow({
  label,
  window,
}: {
  label: string;
  window: PackageUsageWindow | null;
}) {
  const percentage = window?.percentage ?? 0;
  const warning = percentage >= 90;

  return (
    <VStack spacing={1} padding={{ top: 4 }}>
      <HStack font={"caption"} fontWeight={"semibold"} foregroundStyle={"secondaryLabel"}>
        <Text>{label}</Text>
        <Spacer />
        <Text foregroundStyle={warning ? "systemRed" : "label"} monospacedDigit={true}>
          {window ? `${formatPercentage(percentage)}%` : "—"}
        </Text>
      </HStack>
      <UsageProgress percentage={percentage} color={warning ? "systemRed" : "tintColor"} height={6} />
      <HStack font="caption" foregroundStyle="secondaryLabel">
        <Text monospacedDigit={true} lineLimit={1} minScaleFactor={0.7}>
          {window ? formatUsage(window, true) : "暂无数据"}
        </Text>
        <Spacer minLength={4} />
        <Text monospacedDigit={true} lineLimit={1} minScaleFactor={0.7}>
          {window?.resetAt ? `重置 ${formatResetTime(window.resetAt, true)}` : ""}
        </Text>
      </HStack>
    </VStack>
  );
}

export function UsageProgress({
  percentage,
  color = "tintColor",
  height = 8,
}: {
  percentage: number;
  color?: "tintColor" | "systemRed";
  height?: number;
}) {
  const cornerRadius = height;
  return (
    <ZStack>
      <Rectangle
        frame={{ height }}
        fill={"tertiarySystemFill"}
        clipShape={{ type: "rect", cornerRadius }}
        overlay={
          <Rectangle
            fill={{ gradient: true, color }}
            scaleEffect={{
              x: Math.max(0, Math.min(100, percentage)) / 100,
              y: 1,
              anchor: "leading",
            }}
            clipShape={{ type: "rect", cornerRadius }}
          />
        }
      />
    </ZStack>
  );
}

export function formatPercentage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatPlanLevel(level: string): string {
  const names: Record<string, string> = { lite: "Lite", pro: "Pro", max: "Max" };
  return names[level.toLowerCase()] ?? level;
}

export function formatUsage(window: PackageUsageWindow, compact = false): string {
  if (window.used !== undefined && window.total !== undefined) {
    const used = formatQuota(window.used, compact);
    const total = formatQuota(window.total, compact);
    return compact ? `${used}/${total}` : `已用 ${used} / ${total}`;
  }
  if (window.remaining !== undefined) {
    return `${compact ? "剩" : "剩余"} ${formatQuota(window.remaining, compact)}`;
  }
  return `已用 ${formatPercentage(window.percentage)}%`;
}

export function formatRemaining(window: PackageUsageWindow): string {
  if (window.remaining !== undefined) return `剩余 ${formatQuota(window.remaining)}`;
  if (window.used !== undefined && window.total !== undefined) {
    return `剩余 ${formatQuota(Math.max(0, window.total - window.used))}`;
  }
  return "";
}

export function formatQuota(value: number, compact = false): string {
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${trimDecimal(value / 1000000)}M`;
    if (abs >= 1000) return `${trimDecimal(value / 1000)}K`;
  }
  return Number.isInteger(value)
    ? value.toLocaleString("zh-CN")
    : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function trimDecimal(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, "");
}

export function formatResetTime(timestamp: number, compact = false): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "—";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  if (compact && sameDay) return `${hour}:${minute}`;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}
