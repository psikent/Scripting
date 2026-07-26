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
            message: "获取 Account ID 失败",
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
      <Section header={<Text>信息</Text>}>
        <TokenSec />
        <SettingsLinkRow
          title="登录 ChatGPT 网页版"
          systemImage="safari"
          url="https://chatgpt.com"
        />
        <SettingsLinkRow
          title="获取 Access Token"
          systemImage="key"
          url="https://chatgpt.com/api/auth/session"
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
  return <TextField title={"Token"} value={v} />;
}