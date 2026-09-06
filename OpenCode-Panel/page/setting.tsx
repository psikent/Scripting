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
      <Section header={<Text>OpenCode API Key</Text>} footer={<TokenHelp />}>
        <TokenSec />
        <SettingsLinkRow
          title="打开 OpenCode API 管理"
          systemImage="key.fill"
          url="https://opencode.ai/auth"
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
        "需要 OpenCode API Key（sk- 开头）：\n\n1. 打开下方的 OpenCode API 管理页并登录。\n\n2. 创建 API Key，复制完整值后粘贴到这里保存。\n\n此 Key 仅用于读取 Go 限额（5 小时 / 1 周 / 1 月）。"
      }
    </Text>
  );
}
