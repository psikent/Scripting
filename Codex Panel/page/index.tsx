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
  const data = useObservable<any>();

  async function init() {
    try {
      if (!api.token) return data.setValue(null);
      const r = await api.getUsage();
      if (r.error) throw r.error.message;
      if (r) data.setValue(r);
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
        label={<Label title={"请先设置 Token"} systemImage={"gear"} />}
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
        }
        footer={
          <Text>
            {`已用 ${rate_limit.primary_window.used_percent}% · Reset: ${new Date(rate_limit.primary_window.reset_at * 1000).toLocaleString("zh-CN")}`}
          </Text>
        }>
        <Rectangle
          frame={{ height: 24 }}
          fill={"tertiarySystemFill"}
          clipShape={{
            type: "capsule",
            style: "continuous",
          }}
          overlay={
            <Rectangle
              fill={{
                gradient: true,
                color: "tintColor",
              }}
              scaleEffect={{
                x: rate_limit.primary_window.used_percent / 100,
                y: 1,
                anchor: "leading",
              }}
              clipShape={{
                type: "capsule",
                style: "continuous",
              }}
            />
          }
        />
      </Section>
    </List>
  );
}