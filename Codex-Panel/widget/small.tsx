import { Divider, HStack, Rectangle, Spacer, Text, VStack, ZStack } from "scripting";
import { RateLimitWindow } from "../class/usage";
import {
  getResetCardUrgency,
  ResetCard,
  ResetCardSnapshot,
  selectUpcomingResetCards,
} from "../class/reset-cards";
import { View as Header } from "./comp/header";

export type ResetCardLoadState =
  | { kind: "success"; snapshot: ResetCardSnapshot }
  | { kind: "failure" };

export function View({
  weekly,
  resetCards,
}: {
  weekly: RateLimitWindow | null;
  resetCards: ResetCardLoadState;
}) {
  const now = Date.now();
  const cards = resetCards.kind === "success"
    ? selectUpcomingResetCards(resetCards.snapshot, now)
    : [];

  return (
    <VStack padding={true} alignment={"leading"}>
      <Header />
      <Divider />
      {weekly ? (
        <LimitRow title={"每周"} window={weekly} />
      ) : (
        <Text font={"caption"} foregroundStyle={"secondaryLabel"}>
          {"暂无周额度数据"}
        </Text>
      )}
      <Divider />
      <ResetCardsSection state={resetCards} cards={cards} now={now} />
    </VStack>
  );
}

export default View;

function ResetCardsSection({
  state,
  cards,
  now,
}: {
  state: ResetCardLoadState;
  cards: ResetCard[];
  now: number;
}) {
  if (state.kind === "failure") {
    return <StatusText text={"重置卡获取失败"} />;
  }

  const snapshot = state.snapshot;
  if (snapshot.availableCount === 0) {
    return <StatusText text={"暂无可用重置卡"} />;
  }
  if (cards.length === 0) {
    return (
      <VStack alignment={"leading"} spacing={2}>
        <Text font={"caption"} fontWeight={"semibold"} foregroundStyle={"secondaryLabel"}>
          {`重置卡 0/${snapshot.availableCount}`}
        </Text>
        <StatusText
          text={snapshot.hasMoreAvailableCredits
            ? "还有其他卡片详情未返回"
            : "当前没有未过期的卡片"}
        />
      </VStack>
    );
  }

  const title = snapshot.availableCount > 2
    ? `重置卡 ${cards.length}/${snapshot.availableCount}`
    : "重置卡";

  return (
    <VStack alignment={"leading"} spacing={2}>
      <Text font={"caption"} fontWeight={"semibold"} foregroundStyle={"secondaryLabel"}>
        {title}
      </Text>
      {cards.map((card, index) => (
        <ResetCardRow key={`${card.expiresAt}-${index}`} card={card} now={now} />
      ))}
      {snapshot.hasMoreAvailableCredits ? (
        <StatusText text={"还有其他重置卡"} />
      ) : null}
    </VStack>
  );
}

function ResetCardRow({ card, now }: { card: ResetCard; now: number }) {
  const urgency = getResetCardUrgency(card.expiresAt, now);
  const foregroundStyle = urgency === "critical"
    ? "systemRed"
    : urgency === "warning"
      ? "systemOrange"
      : "secondaryLabel";
  const text = `${formatExpiry(card.expiresAt)} 到期`;

  return (
    <Text font={"caption2"} foregroundStyle={foregroundStyle} lineLimit={1}>
      {text}
    </Text>
  );
}

function StatusText({ text }: { text: string }) {
  return (
    <Text font={"caption2"} foregroundStyle={"secondaryLabel"} lineLimit={1}>
      {text}
    </Text>
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

function formatExpiry(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReset(reset: number) {
  return new Date(reset * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
