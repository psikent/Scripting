import {
  Button,
  HStack,
  Image,
  Link,
  List,
  Navigation,
  NavigationStack,
  ProgressView,
  Section,
  Spacer,
  Text,
  TextField,
  useEffect,
  useObservable,
} from "scripting";
import { api } from "../class/api";

export function View() {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <StackView
        navigationTitle={"设置"}
        toolbar={{
          cancellationAction: [<Button title={"关闭"} systemImage={"xmark"} action={dismiss} />],
          confirmationAction: [<SaveButton />],
        }}
      />
    </NavigationStack>
  );
}

export default View;

function SaveButton() {
  const dismiss = Navigation.useDismiss();
  const load = useObservable<boolean>(false);
  return (
    <Button
      action={async () => {
        load.setValue(true);
        const status = await api.save();
        load.setValue(false);
        if (!status) {
          Dialog.alert({
            title: "错误",
            message: "保存失败",
          });
        } else {
          dismiss();
        }
      }}>
      {load.value ? <ProgressView /> : <Image systemName={"checkmark"} />}
    </Button>
  );
}

function StackView() {
  return (
    <List>
      <Section header={<Text>Workspace API Key</Text>} footer={<TokenHelp />}>
        <TokenSec />
        <SettingsLinkRow
          title="打开 OpenCode Console"
          systemImage="safari"
          url="https://opencode.ai/console"
        />
        <SettingsLinkRow
          title="直接打开 Keys 页"
          systemImage="key.fill"
          url="https://opencode.ai/console/keys"
        />
      </Section>
    </List>
  );
}

type SettingsLinkRowProps = {
  title: string;
  systemImage: string;
  url: string;
};

function SettingsLinkRow({ title, systemImage, url }: SettingsLinkRowProps) {
  return (
    <Link
      url={url}
      buttonStyle="plain"
      accessibilityLabel={title}
      accessibilityHint="打开网页">
      <HStack
        spacing={12}
        frame={{
          maxWidth: "infinity",
          minHeight: 44,
          alignment: "leading",
        }}>
        <Image
          systemName={systemImage}
          accessibilityHidden={true}
          frame={{ width: 24 }}
          foregroundStyle="accentColor"
        />
        <Text foregroundStyle="label">{title}</Text>
        <Spacer />
        <Image
          systemName="arrow.up.right"
          accessibilityHidden={true}
          imageScale="small"
          foregroundStyle="secondaryLabel"
        />
      </HStack>
    </Link>
  );
}

function TokenSec() {
  const v = useObservable(api.token);
  useEffect(() => {
    api.token = v.value;
  }, [v.value]);
  return <TextField title={"API Key"} value={v} />;
}

function TokenHelp() {
  return (
    <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
      {
        "需要你 Go 订阅所在工作区的 API Key（sk- 开头）：\n\n1. 打开 opencode.ai/console，登录后点顶部「Keys」标签页。\n\n2. 点 Create 创建一个 key（名字随意），复制完整值（sk- 开头，只在创建时显示一次）。\n\n3. 粘贴到这里保存。此 key 仅用于读取 Go 限额（5 小时 / 1 周 / 1 月）。"
      }
    </Text>
  );
}
