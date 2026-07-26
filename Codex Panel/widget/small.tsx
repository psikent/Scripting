import { Divider, HStack, Rectangle, Spacer, Text, VStack, ZStack } from "scripting";
import { View as Header } from "./comp/header";

export function View({ email, percent, reset }: { email: string; percent: number; reset: number }) {
  return (
    <VStack padding={true} alignment={"leading"}>
      <Header />
      <Divider />
      <Text
        lineLimit={1}
        font={"caption"}
        fontWeight={"semibold"}
        foregroundStyle={"secondaryLabel"}
        padding={{ top: 4, bottom: 5 }}>
        {email}
      </Text>
      <Progress percent={percent} padding={{ top: -2, bottom: 6 }} />
      <HStack font={"caption"} fontWeight={"semibold"} foregroundStyle={"secondaryLabel"}>
        <Text>{"Reset:"}</Text>
        <Spacer />
        <Text>
          {new Date(reset * 1000).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </HStack>
    </VStack>
  );
}

function Progress({ percent }: { percent: number }) {
  const cornerRadius = 13;
  return (
    <ZStack>
      <Rectangle
        fill={"tertiarySystemFill"}
        clipShape={{
          type: "rect",
          cornerRadius: cornerRadius,
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
              cornerRadius: cornerRadius,
            }}
          />
        }
      />
      <HStack>
        <Spacer />
        <Text
          font={"headline"}
          padding={{ trailing: 9 }}
          monospacedDigit={true}
          // foregroundStyle={"secondaryLabel"}
        >{`${percent}%`}</Text>
      </HStack>
    </ZStack>
  );
}