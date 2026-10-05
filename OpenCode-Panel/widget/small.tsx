import { Divider, HStack, Rectangle, Spacer, Text, VStack, ZStack } from "scripting";
import { WINDOW_META, remainingPercent, type GoUsage, type WindowKey } from "../class/api";
import { View as Header } from "./comp/header";

export function View({ usage }: { usage: GoUsage["usage"] }) {
  return (
    <VStack padding={true} alignment={"leading"} spacing={2}>
      <Header />
      <Divider />
      {(Object.keys(WINDOW_META) as WindowKey[]).map((k) => (
        <Row key={k} windowKey={k} usage={usage} />
      ))}
    </VStack>
  );
}

function Row({ windowKey, usage }: { windowKey: WindowKey; usage: GoUsage["usage"] }) {
  const window = usage[windowKey];
  const limited = window.status === "rate-limited";
  const remaining = remainingPercent(window.percent);

  return (
    <VStack spacing={0} padding={{ top: 1 }}>
      <HStack font={"caption2"} fontWeight={"semibold"} foregroundStyle={"secondaryLabel"}>
        <Text>{WINDOW_META[windowKey].label}</Text>
        <Spacer />
        <Text
          font={"caption"}
          foregroundStyle={limited ? "systemRed" : "label"}
          monospacedDigit={true}>
          {`${remaining}%`}
        </Text>
      </HStack>
      <Progress percent={remaining} color={limited ? "systemRed" : "tintColor"} />
      <Text font={"caption2"} foregroundStyle={"secondaryLabel"}>
        {`重置 ${formatReset(window.resetsAt)}`}
      </Text>
    </VStack>
  );
}

function formatReset(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Progress({
  percent,
  color = "tintColor",
}: {
  percent: number;
  color?: "tintColor" | "systemRed";
}) {
  const cornerRadius = 6;
  return (
    <ZStack>
      <Rectangle
        frame={{ height: 8 }}
        fill={"tertiarySystemFill"}
        clipShape={{
          type: "rect",
          cornerRadius,
        }}
        overlay={
          <Rectangle
            fill={{
              gradient: true,
              color,
            }}
            scaleEffect={{
              x: Math.min(100, percent) / 100,
              y: 1,
              anchor: "leading",
            }}
            clipShape={{
              type: "rect",
              cornerRadius,
            }}
          />
        }
      />
    </ZStack>
  );
}
