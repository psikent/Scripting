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
  AbortController,
  type AbortSignal,
  useEffect,
  useObservable,
} from "scripting";
import { api } from "../class/api";
import {
  beginDeviceLogin,
  clearStoredAuth,
  getAccountEmail,
  type DeviceLoginSession,
} from "../class/auth";

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
        try {
          const status = await api.save();
          if (!status) {
            await Dialog.alert({
              title: "错误",
              message: "保存失败",
            });
          } else {
            dismiss(true);
          }
        } catch (e) {
          await Dialog.alert({
            title: "错误",
            message: String(e),
          });
        } finally {
          load.setValue(false);
        }
      }}>
      {load.value ? <ProgressView /> : <Image systemName={"checkmark"} />}
    </Button>
  );
}

function StackView() {
  return (
    <List>
      <Section header={<Text>ChatGPT 账号</Text>} footer={<OAuthFooter />}>
        <AccountRow />
        <DeviceLoginRow />
        <LogoutRow />
      </Section>
      <Section header={<Text>手动 Access Token（备用）</Text>} footer={<TokenHelp />}>
        <TokenSec />
        <SettingsLinkRow
          title="登录 ChatGPT 网页版"
          systemImage="safari"
          url="https://chatgpt.com"
        />
        <DebugTokenRow />
        <SettingsLinkRow
          title="手动获取 Access Token"
          systemImage="key"
          url="https://chatgpt.com/api/auth/session"
        />
      </Section>
    </List>
  );
}

function OAuthFooter() {
  return (
    <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
      {"推荐使用设备码登录：授权一次后凭据自动续期，无需定期手动更新 Token。"}
    </Text>
  );
}

function AccountRow() {
  const v = useObservable<string>(getAccountEmail());
  return (
    <HStack spacing={12} frame={{ maxWidth: "infinity", minHeight: 44 }}>
      <Image
        systemName={"person.circle"}
        accessibilityHidden={true}
        frame={{ width: 24 }}
        foregroundStyle={"accentColor"}
      />
      <Text foregroundStyle={v.value ? "label" : "secondaryLabel"}>
        {v.value || "未登录"}
      </Text>
    </HStack>
  );
}

/** One-tap device-code login: request code, open browser, poll until approved. */
function DeviceLoginRow() {
  const state = useObservable<"idle" | "waiting" | "loading">("idle");
  const session = useObservable<DeviceLoginSession | null>(null);
  const controller = useObservable<AbortController | null>(null);

  async function start(): Promise<void> {
    state.setValue("waiting");
    controller.setValue(new AbortController());
    try {
      const s = await beginDeviceLogin();
      session.setValue(s);
      await Safari.openURL(s.challenge.verificationUrl);
      await Dialog.confirm({
        title: "等待授权",
        message: `已在浏览器打开授权页面。\n\n请登录并输入一次性代码：\n${s.challenge.userCode}\n\n完成后点击“已授权”。`,
        confirmLabel: "已授权",
        cancelLabel: "取消",
      }).then(async (confirmed: boolean) => {
        if (!confirmed) {
          controller.value?.abort();
          state.setValue("idle");
          return;
        }
        await finish(s, controller.value?.signal);
      });
    } catch (e) {
      await Dialog.alert({ title: "登录失败", message: String(e) });
      state.setValue("idle");
    }
  }

  async function finish(s: DeviceLoginSession, signal?: AbortSignal): Promise<void> {
    state.setValue("loading");
    try {
      await s.complete(signal);
      session.setValue(null);
      state.setValue("idle");
      await Dialog.alert({ title: "登录成功", message: `账号：${getAccountEmail() || "未知"}` });
    } catch (e) {
      await Dialog.alert({ title: "登录失败", message: String(e) });
      state.setValue("idle");
    }
  }

  return (
    <Button action={start} buttonStyle="plain" disabled={state.value !== "idle"}>
      <HStack
        spacing={12}
        frame={{ maxWidth: "infinity", minHeight: 44, alignment: "leading" }}>
        <Image
          systemName={state.value === "idle" ? "key.horizontal" : "hourglass"}
          accessibilityHidden={true}
          frame={{ width: 24 }}
          foregroundStyle={"accentColor"}
        />
        <Text foregroundStyle={"label"}>
          {state.value === "waiting"
            ? "等待浏览器授权…"
            : state.value === "loading"
              ? "正在交换令牌…"
              : "设备码登录"}
        </Text>
        <Spacer />
        {state.value !== "idle" ? <ProgressView /> : null}
      </HStack>
    </Button>
  );
}

function LogoutRow() {
  const hasAuth = useObservable<boolean>(Boolean(getAccountEmail()));
  useEffect(() => {
    // Re-evaluate when returning to this screen.
    hasAuth.setValue(Boolean(getAccountEmail()));
  }, []);
  if (!hasAuth.value) return null;
  return (
    <Button
      action={async () => {
        const confirmed = await Dialog.confirm({
          title: "退出登录",
          message: "将清除已保存的 OAuth 凭据，需要重新登录才能继续使用。",
          confirmLabel: "退出",
        });
        if (!confirmed) return;
        clearStoredAuth();
        hasAuth.setValue(false);
        await Dialog.alert({ title: "已退出", message: "OAuth 凭据已清除。" });
      }}
      buttonStyle="plain"
      role="destructive">
      <HStack
        spacing={12}
        frame={{ maxWidth: "infinity", minHeight: 44, alignment: "leading" }}>
        <Image
          systemName="rectangle.portrait.and.arrow.right"
          accessibilityHidden={true}
          frame={{ width: 24 }}
          foregroundStyle={"red"}
        />
        <Text foregroundStyle={"red"}>{"退出登录"}</Text>
      </HStack>
    </Button>
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

  async function pasteToken() {
    v.setValue("");
    api.token = "";

    const text = await Pasteboard.getString();
    const token = text?.trim();
    if (!token) return;
    v.setValue(token);
    api.token = token;
  }

  return (
    <HStack spacing={8}>
      <TextField title={"Token"} value={v} />
      <Button title={"粘贴"} systemImage={"doc.on.clipboard"} action={pasteToken} />
    </HStack>
  );
}

function TokenHelp() {
  return (
    <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
      {
        "仅在设备码登录不可用时使用。需填 ChatGPT 登录后的 access token（JWT），非 API Key。点下方“获取 Access Token（Safari 调试）”按钮，在 Safari 登录后页面底部会显示 token，点“复制”粘贴到这里即可。"
      }
    </Text>
  );
}

/** 打开系统 Safari 的 ChatGPT，配合 Codex Token Helper 用户脚本自动显示 token */
function DebugTokenRow() {
  return (
    <Button
      action={async () => {
        await Safari.openURL("https://chatgpt.com");
      }}
      buttonStyle="plain">
      <HStack
        spacing={12}
        frame={{ maxWidth: "infinity", minHeight: 44, alignment: "leading" }}>
        <Image
          systemName="safari"
          accessibilityHidden={true}
          frame={{ width: 24 }}
          foregroundStyle="accentColor"
        />
        <Text foregroundStyle="label">{"获取 Access Token（Safari 调试）"}</Text>
        <Spacer />
        <Image
          systemName="arrow.up.right"
          accessibilityHidden={true}
          imageScale="small"
          foregroundStyle="secondaryLabel"
        />
      </HStack>
    </Button>
  );
}
