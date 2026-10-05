import { Divider, HStack, Rectangle, Spacer, Text, VStack, ZStack } from "scripting";
import { RateLimitWindow } from "../class/usage";
import { View as Header } from "./comp/header";

export function View({
  email,
  fiveHour,
  weekly,
}: {
  email: string;
  fiveHour: RateLimitWindow | null;
  weekly: RateLimitWindow | null;
}) {
  return (
    <VStack padding={true} alignment={"leading"}>
      <Header />
      <Divider />
      <Text
        lineLimit={1}
        font={"caption"}
        fontWeight={"semibold"}
        foregroundStyle={"secondaryLabel"}
        padding={{ top: 4, bottom: 2 }}>
        {email}
      </Text>
      {fiveHour ? <LimitRow title={"5 小时"} window={fiveHour} /> : null}
      {weekly ? <LimitRow title={"每周"} window={weekly} /> : null}
    </VStack>
  );
}

function LimitRow({ title, window }: { title: string; window: RateLimitWindow }) {
  return (
    <VStack alignment={"leading"}>
      <HStack font={"caption"} fontWeight={"semibold"} foregroundStyle={"secondaryLabel"}>
        <Text>{title}</Text>
        <Spacer />
        <Text monospacedDigit={true}>{`${100 - window.used_percent}%`}</Text>
      </HStack>
      <Progress percent={100 - window.used_percent} />
      <HStack font={"caption2"} foregroundStyle={"secondaryLabel"}>
        <Text>{"重置"}</Text>
        <Spacer />
        <Text>{formatReset(window.reset_at)}</Text>
      </HStack>
    </VStack>
  );
}

function Progress({ percent }: { percent: number }) {
  const cornerRadius = 4;
  return (
    <ZStack frame={{ height: 8 }}>
      <Rectangle
        fill={"tertiarySystemFill"}
        clipShape={{
          type: "rect",
          cornerRadius,
        }}
        overlay={
          <Rectangle
            fill={{
              gradient: true,
              color: "tintColor",
            }}
            scaleEffect={{
              x: percent / 100,
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

function formatReset(reset: number) {
  return new Date(reset * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
