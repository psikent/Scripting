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
  VStack,
  useEffect,
  useObservable,
} from "scripting";
import { api, PackageUsageWindow } from "../class/api";

export function View() {
  const dismiss = Navigation.useDismiss();
  const token = useObservable(api.token);
  const codingPlanKey = useObservable(api.codingPlanKey);
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
        <Section header={<Text>Coding Plan 套餐</Text>} footer={<CodingPlanHelp />}>
          <CodingPlanKeyField value={codingPlanKey} />
          <PackageUsageSection apiKey={codingPlanKey} />
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

function CodingPlanKeyField({ value }: { value: Observable<string> }) {
  useEffect(() => {
    api.codingPlanKey = value.value;
  }, [value.value]);
  return <SecureField title={"Coding Plan API Key"} prompt={"填入套餐专用 Key"} value={value} />;
}

function CodingPlanHelp() {
  return (
    <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
      {
        "需填写在个人编程套餐页面创建的专用 API Key。查询接口只读取套餐用量，不会消耗额度。"
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

interface BalanceData {
  total: number;
  balance: number;
  recharge: number;
  granted: number;
  spend: number;
  totalSpend: number;
}

interface BalanceState {
  loading: boolean;
  data: BalanceData | null;
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
      state.setValue({
        loading: false,
        data: {
          total: account.availableBalance,
          balance: account.balance,
          recharge: account.rechargeAmount,
          granted: account.giveAmount,
          spend,
          totalSpend: account.totalSpendAmount,
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

interface PackageUsageState {
  loading: boolean;
  level: string;
  windows: PackageUsageWindow[];
  error: string;
}

function PackageUsageSection({ apiKey }: { apiKey: Observable<string> }) {
  const state = useObservable<PackageUsageState>({
    loading: false,
    level: "",
    windows: [],
    error: "",
  });

  const refresh = async () => {
    if (!apiKey.value.trim()) {
      state.setValue({ loading: false, level: "", windows: [], error: "" });
      return;
    }
    state.setValue({ loading: true, level: "", windows: [], error: "" });
    try {
      const usage = await api.getPackageUsage(apiKey.value);
      state.setValue({
        loading: false,
        level: usage.level,
        windows: [usage.rolling, usage.weekly, usage.monthly].filter(
          (window): window is PackageUsageWindow => window !== null,
        ),
        error: "",
      });
    } catch (e) {
      state.setValue({
        loading: false,
        level: "",
        windows: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  if (!apiKey.value.trim()) {
    return <Button title="查询套餐用量" action={refresh} />;
  }
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

  return (
    <>
      {state.value.level ? (
        <BalanceRow label="套餐等级" value={formatPlanLevel(state.value.level)} />
      ) : null}
      {state.value.windows.map((window) => (
        <PackageUsageRow window={window} />
      ))}
      <Button title="刷新套餐用量" action={refresh} />
    </>
  );
}

function PackageUsageRow({ window }: { window: PackageUsageWindow }) {
  const title =
    window.kind === "rolling" ? "5 小时额度" : window.kind === "weekly" ? "每周额度" : "MCP 月额度";
  const detail = formatUsageDetail(window);
  const reset = window.resetAt ? `下次重置 ${formatResetTime(window.resetAt)}` : "";
  return (
    <VStack alignment="leading" spacing={6} padding={{ top: 6, bottom: 6 }}>
      <HStack frame={{ maxWidth: "infinity" }}>
        <Text foregroundStyle="label">{title}</Text>
        <Spacer />
        <Text monospacedDigit={true} foregroundStyle={usageColor(window.percentage)}>
          {`${window.percentage.toFixed(1)}%`}
        </Text>
      </HStack>
      <ProgressView value={window.percentage} total={100} />
      {detail || reset ? (
        <HStack frame={{ maxWidth: "infinity" }}>
          <Text font="caption" foregroundStyle="secondaryLabel" monospacedDigit={true}>
            {detail}
          </Text>
          <Spacer />
          <Text font="caption" foregroundStyle="secondaryLabel" monospacedDigit={true}>
            {reset}
          </Text>
        </HStack>
      ) : null}
    </VStack>
  );
}

function formatPlanLevel(level: string): string {
  const names: Record<string, string> = { lite: "Lite", pro: "Pro", max: "Max" };
  return names[level.toLowerCase()] ?? level;
}

function formatUsageDetail(window: PackageUsageWindow): string {
  if (window.used !== undefined && window.total !== undefined) {
    return `${formatQuota(window.used)} / ${formatQuota(window.total)}`;
  }
  if (window.remaining !== undefined && window.total !== undefined) {
    return `剩余 ${formatQuota(window.remaining)} / ${formatQuota(window.total)}`;
  }
  return window.remaining !== undefined ? `剩余 ${formatQuota(window.remaining)}` : "";
}

function formatQuota(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("zh-CN")
    : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatResetTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

function usageColor(percentage: number): "systemRed" | "systemOrange" | "label" {
  if (percentage >= 90) return "systemRed";
  if (percentage >= 70) return "systemOrange";
  return "label";
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
