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
import { api, WINDOW_META, type GoUsage, type GoWindow, type WindowKey } from "../class/api";
import { View as SettingView } from "./setting";

export function View() {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <StackView
        navigationTitle={Script.name}
        toolbar={{
          topBarLeading: [<Button title={"关闭"} systemImage={"xmark"} action={dismiss} />],
          topBarTrailing: [
            <Button
              title={"设置"}
              systemImage={"gear"}
              action={() => Navigation.present(<SettingView />)}
            />,
          ],
        }}
      />
    </NavigationStack>
  );
}

export default View;

function StackView() {
  const data = useObservable<GoUsage | null>();

  async function init() {
    try {
      if (!api.token) return data.setValue(null);
      const r = await api.goUsage();
      data.setValue(r);
    } catch (e) {
      await Dialog.alert({ message: String(e) });
    }
  }

  useEffect(() => {
    init();
  }, []);

  if (data.value === undefined) {
    return <ProgressView />;
  }

  if (data.value === null) {
    return (
      <ContentUnavailableView
        label={<Label title={"请先设置 API Key"} systemImage={"gear"} />}
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

  const usage = data.value as GoUsage;

  return (
    <List
      refreshable={async () => {
        await Promise.all([init(), new Promise((r: any) => setTimeout(r, 500))]);
      }}>
      <Section
        header={<Text>OpenCode Go 限额</Text>}
        footer={<Text>{"数据来自 opencode.ai Go 订阅限额端点，点小组件可刷新"}</Text>}>
        {(Object.keys(WINDOW_META) as WindowKey[]).map((k) => (
          <WindowRow key={k} windowKey={k} window={usage.usage[k]} />
        ))}
      </Section>
    </List>
  );
}

function WindowRow({ windowKey, window }: { windowKey: WindowKey; window: GoWindow }) {
  const meta = WINDOW_META[windowKey];
  const limited = window.status === "rate-limited";

  return (
    <VStack spacing={4} padding={{ vertical: 6 }}>
      <HStack>
        <Text fontWeight={"semibold"}>{meta.label}</Text>
        <Spacer />
        <Text font={"footnote"} foregroundStyle={"secondaryLabel"} monospacedDigit={true}>
          {`限额 $${meta.limit} · 已用 ${window.percent}%`}
        </Text>
      </HStack>
      <Progress percent={window.percent} color={limited ? "systemRed" : "tintColor"} />
      <HStack>
        <Text font={"footnote"} foregroundStyle={limited ? "systemRed" : "secondaryLabel"}>
          {limited ? "已超出限额" : "状态正常"}
        </Text>
        <Spacer />
        <Text font={"footnote"} foregroundStyle={"secondaryLabel"} monospacedDigit={true}>
          {`重置 ${new Date(window.resetsAt).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}`}
        </Text>
      </HStack>
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
  const cornerRadius = 13;
  return (
    <Rectangle
      frame={{ height: 12 }}
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
  );
}
