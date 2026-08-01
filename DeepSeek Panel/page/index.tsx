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
import { currencySymbol, WidgetData } from "../widget/small";

export function View() {
  const dismiss = Navigation.useDismiss();
  const token = useObservable(api.token);
  return (
    <NavigationStack>
      <List
        navigationTitle={"DeepSeek"}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          cancellationAction: [
            <Button title={"关闭"} systemImage={"xmark"} action={dismiss} />,
          ],
          confirmationAction: [<SaveButton />],
        }}>
        <Section header={<Text>API Key</Text>}>
          <TokenField value={token} />
          <SettingsLinkRow
            title={"获取 API Key"}
            systemImage={"key"}
            url={"https://platform.deepseek.com/api_keys"}
          />
        </Section>
        <Section header={<Text>余额</Text>}>
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
  return <SecureField title={"API Key"} prompt={"sk-..."} value={value} />;
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
      state.setValue({ loading: false, data: null, error: "请先填写 API Key" });
      return;
    }
    state.setValue({ loading: true, data: null, error: "" });
    try {
      const res = await api.getBalance();
      const info = res.balance_infos[0];
      if (!info) throw new Error("未获取到余额信息");
      const total = parseFloat(info.total_balance) || 0;
      state.setValue({
        loading: false,
        data: {
          currency: info.currency,
          total,
          granted: parseFloat(info.granted_balance) || 0,
          toppedUp: parseFloat(info.topped_up_balance) || 0,
          spend: api.getTodaySpend(total),
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
  const symbol = currencySymbol(d.currency);
  return (
    <>
      <BalanceRow label={"总余额"} value={`${symbol}${d.total.toFixed(2)}`} />
      <BalanceRow
        label={"今日开销"}
        value={d.spend > 0 ? `-${symbol}${d.spend.toFixed(2)}` : `${symbol}0.00`}
        highlight={d.spend > 0}
      />
      <BalanceRow label={"赠金余额"} value={`${symbol}${d.granted.toFixed(2)}`} />
      <BalanceRow label={"充值余额"} value={`${symbol}${d.toppedUp.toFixed(2)}`} />
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
