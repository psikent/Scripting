import { Divider, HStack, Rectangle, Spacer, Text, VStack, ZStack } from "scripting";
import { WINDOW_META, type GoUsage, type WindowKey } from "../class/api";
import { View as Header } from "./comp/header";

export function View({ usage }: { usage: GoUsage["usage"] }) {
  return (
    <VStack padding={true} alignment={"leading"}>
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

  return (
    <VStack spacing={2} padding={{ top: 4 }}>
      <HStack font={"caption"} fontWeight={"semibold"} foregroundStyle={"secondaryLabel"}>
        <Text>{WINDOW_META[windowKey].label}</Text>
        <Spacer />
        <Text
          foregroundStyle={limited ? "systemRed" : "label"}
          monospacedDigit={true}>
          {`${window.percent}%`}
        </Text>
      </HStack>
      <Progress percent={window.percent} color={limited ? "systemRed" : "tintColor"} />
    </VStack>
  );
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
          cornerRadius: cornerRadius,
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
              cornerRadius: cornerRadius,
            }}
          />
        }
      />
    </ZStack>
  );
}
