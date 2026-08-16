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
  SecureField,
  Spacer,
  Text,
  useEffect,
  useObservable,
} from "scripting";
import { api } from "../class/api";
import { WidgetData } from "../widget/small";

export function View() {
  const dismiss = Navigation.useDismiss();
  const token = useObservable(api.token);
  return (
    <NavigationStack>
      <List
        navigationTitle={"ZCode"}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          cancellationAction: [
            <Button title={"关闭"} systemImage={"xmark"} action={dismiss} />,
          ],
          confirmationAction: [<SaveButton />],
        }}>
        <Section header={<Text>access_token</Text>} footer={<TokenHelp />}>
          <TokenField value={token} />
          <SettingsLinkRow
            title={"打开智谱开放平台登录"}
            systemImage={"key"}
            url={"https://open.bigmodel.cn"}
          />
          <DebugTokenRow />
        </Section>
        <Section header={<Text>账户</Text>}>
          <BalanceSection token={token} />
        </Section>
      </List>
    </NavigationStack>
  );
}

export default View;

function SaveButton() {
  const dismiss = Navigation.useDismiss();
  const saving = useObservable<boolean>(false);
  return (
    <Button
      action={async () => {
        saving.setValue(true);
        const status = api.save();
        saving.setValue(false);
        if (!status) {
          Dialog.alert({
            title: "错误",
            message: "保存失败，请重试",
          });
        } else {
          dismiss();
        }
      }}>
      {saving.value ? <ProgressView /> : <Image systemName={"checkmark"} />}
    </Button>
  );
}

function TokenField({ value }: { value: Observable<string> }) {
  useEffect(() => {
    api.token = value.value;
  }, [value.value]);
  return <SecureField title={"access_token"} prompt={"eyJ..."} value={value} />;
}

function TokenHelp() {
  return (
    <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
      {
        "需填控制台登录 token（JWT），非 API Key。点下方“获取 access_token”按钮，在 Safari 登录后页面底部会显示 token，点“复制”粘贴到这里即可。"
      }
    </Text>
  );
}

/** 打开系统 Safari 的智谱控制台，配合 ZCode Token Helper 用户脚本自动显示 token */
function DebugTokenRow() {
  return (
    <Button
      action={async () => {
        await Safari.openURL("https://open.bigmodel.cn");
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
        <Text foregroundStyle="label">{"获取 access_token（Safari 调试）"}</Text>
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
        frame={{ maxWidth: "infinity", minHeight: 44, alignment: "leading" }}>
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

interface BalanceState {
  loading: boolean;
  data: WidgetData | null;
  error: string;
}

function BalanceSection({ token }: { token: Observable<string> }) {
  const state = useObservable<BalanceState>({
    loading: true,
    data: null,
    error: "",
  });

  const refresh = async () => {
    if (!token.value) {
      state.setValue({ loading: false, data: null, error: "请先填写 access_token" });
      return;
    }
    state.setValue({ loading: true, data: null, error: "" });
    try {
      const account = await api.getAccount();
      const spend = api.getTodaySpend(account.totalSpendAmount);
      const { weekly, average } = api.getWeeklySpend();
      state.setValue({
        loading: false,
        data: {
          total: account.availableBalance,
          balance: account.balance,
          recharge: account.rechargeAmount,
          granted: account.giveAmount,
          spend,
          totalSpend: account.totalSpendAmount,
          weekly,
          average,
        },
        error: "",
      });
    } catch (e) {
      state.setValue({
        loading: false,
        data: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  useEffect(() => {
    refresh();
  }, [token.value]);

  if (state.value.loading) {
    return (
      <HStack frame={{ maxWidth: "infinity", minHeight: 44 }}>
        <Spacer />
        <ProgressView />
        <Spacer />
      </HStack>
    );
  }

  if (state.value.error) {
    return (
      <HStack spacing={12} frame={{ maxWidth: "infinity", minHeight: 44 }}>
        <Image
          systemName="exclamationmark.triangle.fill"
          accessibilityHidden={true}
          foregroundStyle="systemRed"
        />
        <Text foregroundStyle="secondaryLabel" lineLimit={2}>
          {state.value.error}
        </Text>
        <Spacer />
        <Button title="重试" action={refresh} />
      </HStack>
    );
  }

  const d = state.value.data!;
  return (
    <>
      <BalanceRow label={"可用余额"} value={`¥${d.total.toFixed(2)}`} />
      <BalanceRow
        label={"今日开销"}
        value={d.spend > 0 ? `-¥${d.spend.toFixed(2)}` : "¥0.00"}
        highlight={d.spend > 0}
      />
      <BalanceRow label={"总余额"} value={`¥${d.balance.toFixed(2)}`} />
      <BalanceRow label={"累计充值"} value={`¥${d.recharge.toFixed(2)}`} />
      <BalanceRow label={"累计赠送"} value={`¥${d.granted.toFixed(2)}`} />
      <BalanceRow label={"累计消费"} value={`¥${d.totalSpend.toFixed(2)}`} />
    </>
  );
}

function BalanceRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <HStack frame={{ maxWidth: "infinity", minHeight: 44 }}>
      <Text foregroundStyle="label">{label}</Text>
      <Spacer />
      <Text foregroundStyle={highlight ? "systemRed" : "label"} monospacedDigit={true}>
        {value}
      </Text>
    </HStack>
  );
}
