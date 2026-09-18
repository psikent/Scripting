import {
  Button,
  ContentUnavailableView,
  HStack,
  Label,
  List,
  Navigation,
  NavigationStack,
  ProgressView,
  Rectangle,
  Script,
  Section,
  Spacer,
  Text,
  useEffect,
  useObservable,
  VStack,
} from "scripting";
import { api } from "../class/api";
import { RateLimitWindow, resolveRateLimitWindows } from "../class/usage";
import { View as SettingView } from "./setting";

export function View() {
  const dismiss = Navigation.useDismiss();
  const refreshKey = useObservable(0);
  return (
    <NavigationStack>
      <StackView
        refreshKey={refreshKey.value}
        navigationTitle={Script.name}
        toolbar={{
          topBarLeading: [<Button title={"关闭"} systemImage={"xmark"} action={dismiss} />],
          topBarTrailing: [
            <Button
              title={"设置"}
              systemImage={"gear"}
              action={async () => {
                const saved = await Navigation.present(<SettingView />);
                if (saved) refreshKey.setValue(refreshKey.value + 1);
              }}
            />,
          ],
        }}
      />
    </NavigationStack>
  );
}

export default View;

function StackView({
  refreshKey,
  navigationTitle,
  toolbar,
}: {
  refreshKey: number;
  navigationTitle: string;
  toolbar: any;
}) {
  const data = useObservable<any>();

  async function init() {
    try {
      if (!api.token) return data.setValue(null);
      const r = await api.getUsage();
      if (r.error) throw r.error.message;
      if (!r) throw new Error("未获取到额度数据");
      data.setValue(r);
    } catch (e) {
      data.setValue({ error: String(e) });
      await Dialog.alert({ message: String(e) });
    }
  }

  useEffect(() => {
    init();
  }, [refreshKey]);

  if (data.value === undefined) {
    return <ProgressView />;
  }

  if (data.value === null || data.value?.error) {
    const message = data.value?.error;
    return (
      <ContentUnavailableView
        label={
          <Label
            title={message || "请先设置 Token"}
            systemImage={message ? "exclamationmark.triangle" : "gear"}
          />
        }
        actions={[
          <Button
            title={"刷新"}
            systemImage={"arrow.trianglehead.clockwise"}
            action={() => {
              data.setValue(undefined);
              init();
            }}
          />,
        ]}
      />
    );
  }

  const { email, rate_limit, plan_type } = data.value;
  const { fiveHour, weekly } = resolveRateLimitWindows(rate_limit);
  return (
    <List
      refreshable={async () => {
        await Promise.all([init(), new Promise((r: any) => setTimeout(r, 500))]);
      }}>
      <Section
        header={
          <HStack>
            <Text>{`${email}`}</Text>
            <Spacer />
            <Text>{`${plan_type}`}</Text>
          </HStack>
        }>
        {fiveHour ? <LimitProgress title={"5 小时"} window={fiveHour} /> : null}
        {weekly ? <LimitProgress title={"每周"} window={weekly} /> : null}
      </Section>
    </List>
  );
}

function LimitProgress({ title, window }: { title: string; window: RateLimitWindow }) {
  const remainingPercent = 100 - window.used_percent;
  return (
    <VStack alignment={"leading"}>
      <HStack font={"caption"} fontWeight={"semibold"} foregroundStyle={"secondaryLabel"}>
        <Text>{title}</Text>
        <Spacer />
        <Text monospacedDigit={true}>{`${remainingPercent}%`}</Text>
      </HStack>
      <Rectangle
        frame={{ height: 8 }}
        fill={"tertiarySystemFill"}
        clipShape={{
          type: "rect",
          cornerRadius: 4,
        }}
        overlay={
          <Rectangle
            fill={{
              gradient: true,
              color: "tintColor",
            }}
            scaleEffect={{
              x: remainingPercent / 100,
              y: 1,
              anchor: "leading",
            }}
            clipShape={{
              type: "rect",
              cornerRadius: 4,
            }}
          />
        }
      />
      <HStack font={"caption2"} foregroundStyle={"secondaryLabel"}>
        <Text>{"重置"}</Text>
        <Spacer />
        <Text>
          {new Date(window.reset_at * 1000).toLocaleString("zh-CN", {
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
