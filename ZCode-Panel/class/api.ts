import { fetch } from "scripting";

/** 智谱账户资金报表（控制台内部接口） */
export interface AccountReport {
  /** 总余额 */
  balance: number;
  /** 累计充值 */
  rechargeAmount: number;
  /** 累计赠送 */
  giveAmount: number;
  /** 累计消费 */
  totalSpendAmount: number;
  /** 冻结余额 */
  frozenBalance: number;
  /** 可用余额 */
  availableBalance: number;
}

interface AccountResponse {
  code: number;
  msg?: string;
  message?: string;
  success: boolean;
  data?: any;
}

/** Coding Plan 套餐的额度窗口 */
export interface PackageUsageWindow {
  /** 窗口类型 */
  kind: "rolling" | "weekly" | "monthly";
  /** 上游额度类型，兼容旧版 TOKENS_LIMIT 与新版 CREDIT_LIMIT */
  type: string;
  /** 已使用百分比（0-100） */
  percentage: number;
  /** 已使用额度 */
  used?: number;
  /** 总额度 */
  total?: number;
  /** 剩余额度 */
  remaining?: number;
  /** 下次重置时间（Unix 毫秒时间戳） */
  resetAt?: number;
}

/** GLM Coding Plan 套餐用量 */
export interface PackageUsage {
  /** 套餐等级，如 lite / pro / max */
  level: string;
  /** 5 小时滚动额度 */
  rolling: PackageUsageWindow | null;
  /** 每周额度 */
  weekly: PackageUsageWindow | null;
  /** MCP 工具月额度 */
  monthly: PackageUsageWindow | null;
}

interface PackageUsageLimit {
  type?: string;
  unit?: number;
  number?: number;
  usage?: number | string;
  currentValue?: number | string;
  remaining?: number | string;
  percentage?: number | string;
  nextResetTime?: number | string;
}

interface PackageUsageResponse {
  code?: number;
  msg?: string;
  message?: string;
  success?: boolean;
  data?: {
    level?: string;
    limits?: PackageUsageLimit[];
  };
}

interface SpendRecord {
  /** 本地时区日期，格式 YYYY-MM-DD */
  date: string;
  /** 当天首次观察到的累计消费（基线） */
  baselineSpend: number;
  /** 上次刷新时观察到的累计消费 */
  lastSpend: number;
}

/** 单日开销柱形图数据 */
export interface DailySpend {
  /** X 轴标签（周几简称，今天为“今”） */
  label: string;
  /** 本地时区日期，格式 YYYY-MM-DD */
  date: string;
  /** 当日累计开销 */
  value: number;
}

export interface WeeklySpend {
  /** 最近 7 天（含今天），从最旧到最新 */
  weekly: DailySpend[];
  /** 7 日平均开销 */
  average: number;
}

class API {
  private readonly KEY = "zcode_setting";
  private readonly SPEND_KEY = "zcode_spend_record";
  private readonly HISTORY_KEY = "zcode_spend_history";
  private readonly base = "https://open.bigmodel.cn";

  /** 控制台 access_token（JWT，非 API Key） */
  token = "";

  /** GLM Coding Plan 专用 API Key */
  codingPlanKey = "";

  constructor() {
    const saved = Storage.get<{ token?: string; codingPlanKey?: string }>(this.KEY);
    if (saved) Object.assign(this, saved);
  }

  save() {
    return Storage.set(this.KEY, {
      token: this.token,
      codingPlanKey: this.codingPlanKey,
    });
  }

  /**
   * 查询账户资金报表。
   * 智谱控制台内部接口：GET /api/biz/account/query-customer-account-report
   * 鉴权为控制台登录后的 access_token（JWT），直接放在 Authorization 头，不带 Bearer 前缀。
   * 注意：该接口业务码恒为 HTTP 200，需按 body.code 判断成败。
   */
  async getAccount(): Promise<AccountReport> {
    const res = await fetch(
      `${this.base}/api/biz/account/query-customer-account-report`,
      {
        headers: {
          "content-type": "application/json",
          authorization: this.token,
        },
      },
    );
    let json: AccountResponse | null = null;
    try {
      json = await res.json();
    } catch {
      // 网关返回非 JSON 时兜底
    }
    if (json && typeof json === "object") {
      const ok =
        json.success === true ||
        (typeof json.code === "number" && (json.code === 200 || json.code === 0));
      if (!ok) {
        const message = json.msg || json.message;
        throw new Error(
          message ? `账户查询失败: ${message}` : `账户查询失败 (${json.code})`,
        );
      }
      if (json.data) return this.normalize(json.data);
    }
    if (!res.ok) {
      throw new Error(`账户查询失败 (${res.status})`);
    }
    throw new Error("账户查询失败：响应格式异常");
  }

  private normalize(d: any): AccountReport {
    const num = (v: any): number => {
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      balance: num(d.balance),
      rechargeAmount: num(d.rechargeAmount),
      giveAmount: num(d.giveAmount),
      totalSpendAmount: num(d.totalSpendAmount),
      frozenBalance: num(d.frozenBalance),
      availableBalance: num(d.availableBalance),
    };
  }

  /**
   * 查询 GLM Coding Plan 套餐用量。
   * GET /api/monitor/usage/quota/limit
   * 鉴权为 Coding Plan 专用 API Key，直接放在 Authorization 头，不带 Bearer 前缀。
   */
  async getPackageUsage(apiKey = this.codingPlanKey): Promise<PackageUsage> {
    const key = apiKey.trim();
    if (!key) {
      throw new Error("请填写 Coding Plan API Key");
    }
    const res = await fetch(`${this.base}/api/monitor/usage/quota/limit`, {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: key,
      },
    });
    let json: PackageUsageResponse | null = null;
    try {
      json = await res.json();
    } catch {
      // 网关返回非 JSON 时兜底
    }
    if (json && typeof json === "object") {
      const ok =
        json.success === true ||
        (typeof json.code === "number" && (json.code === 200 || json.code === 0));
      if (!ok) {
        const message = json.msg || json.message;
        throw new Error(
          message ? `套餐用量查询失败: ${message}` : `套餐用量查询失败 (${json.code ?? res.status})`,
        );
      }
      if (json.data) return this.normalizePackageUsage(json.data);
    }
    if (!res.ok) {
      throw new Error(`套餐用量查询失败 (${res.status})`);
    }
    throw new Error("套餐用量查询失败：响应格式异常");
  }

  private normalizePackageUsage(data: NonNullable<PackageUsageResponse["data"]>): PackageUsage {
    const result: PackageUsage = {
      level: typeof data.level === "string" ? data.level : "",
      rolling: null,
      weekly: null,
      monthly: null,
    };
    const fallback: PackageUsageWindow[] = [];

    for (const limit of Array.isArray(data.limits) ? data.limits : []) {
      const type = typeof limit.type === "string" ? limit.type : "UNKNOWN";
      const isQuota = type === "TOKENS_LIMIT" || type === "CREDIT_LIMIT";
      if (!isQuota && type !== "TIME_LIMIT") continue;

      if (type === "TIME_LIMIT") {
        result.monthly = this.normalizeUsageWindow("monthly", type, limit);
        continue;
      }

      if (limit.unit === 3) {
        result.rolling = this.normalizeUsageWindow("rolling", type, limit);
      } else if (limit.unit === 6) {
        result.weekly = this.normalizeUsageWindow("weekly", type, limit);
      } else {
        fallback.push(this.normalizeUsageWindow("rolling", type, limit));
      }
    }

    // 部分套餐不返回 unit，以重置时间由近到远补齐 5 小时和每周窗口。
    fallback.sort((a, b) => (a.resetAt ?? Infinity) - (b.resetAt ?? Infinity));
    if (!result.rolling && fallback.length > 0) {
      result.rolling = { ...fallback.shift()!, kind: "rolling" };
    }
    if (!result.weekly && fallback.length > 0) {
      result.weekly = { ...fallback.shift()!, kind: "weekly" };
    }

    if (!result.rolling && !result.weekly && !result.monthly) {
      throw new Error("套餐用量查询失败：未识别到额度窗口");
    }
    return result;
  }

  private normalizeUsageWindow(
    kind: PackageUsageWindow["kind"],
    type: string,
    limit: PackageUsageLimit,
  ): PackageUsageWindow {
    const number = (value: unknown): number | undefined => {
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const total = number(limit.usage);
    let used = number(limit.currentValue);
    let remaining = number(limit.remaining);
    let percentage = number(limit.percentage);

    if (used === undefined && total !== undefined && remaining !== undefined) {
      used = Math.max(0, total - remaining);
    }
    if (remaining === undefined && total !== undefined && used !== undefined) {
      remaining = Math.max(0, total - used);
    }
    if (percentage === undefined && total !== undefined && total > 0 && used !== undefined) {
      percentage = (used / total) * 100;
    }

    const reset = number(limit.nextResetTime);
    const resetAt = reset === undefined ? undefined : reset < 1e12 ? reset * 1000 : reset;
    return {
      kind,
      type,
      percentage: Math.max(0, Math.min(100, percentage ?? 0)),
      used,
      total,
      remaining,
      resetAt,
    };
  }

  /**
   * 计算当天开销（累计消费的当日增量），并写入每日历史。
   * 智谱提供累计消费 totalSpendAmount，故直接以其当日增量为开销，
   * 充值/赠送不影响该口径，跨天时先把前一天最终开销写入历史。
   */
  getTodaySpend(totalSpend: number): number {
    const today = this.todayString();
    const record = Storage.get<SpendRecord>(this.SPEND_KEY);
    const history = Storage.get<Record<string, number>>(this.HISTORY_KEY) ?? {};

    // 跨天：把前一天最终开销写入历史
    if (
      record &&
      record.date &&
      record.date !== today &&
      typeof record.baselineSpend === "number" &&
      typeof record.lastSpend === "number"
    ) {
      history[record.date] = Math.max(0, record.lastSpend - record.baselineSpend);
    }

    const valid =
      record &&
      record.date === today &&
      typeof record.baselineSpend === "number" &&
      typeof record.lastSpend === "number";

    let spend = 0;
    if (!valid) {
      // 无记录 / 跨天 / 旧格式数据：重新建档
      Storage.set(this.SPEND_KEY, {
        date: today,
        baselineSpend: totalSpend,
        lastSpend: totalSpend,
      });
    } else {
      record.lastSpend = totalSpend;
      spend = Math.max(0, totalSpend - record.baselineSpend);
      Storage.set(this.SPEND_KEY, record);
    }

    // 实时写入当天历史
    history[today] = spend;
    this.pruneHistory(history);
    Storage.set(this.HISTORY_KEY, history);

    return spend;
  }

  /**
   * 取最近 7 天（含今天）每日开销与平均值。
   * 缺数据的日期补 0。
   */
  getWeeklySpend(): WeeklySpend {
    const history = Storage.get<Record<string, number>>(this.HISTORY_KEY) ?? {};
    const weekly: DailySpend[] = [];
    let sum = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = this.dateString(d);
      const value = history[date] ?? 0;
      sum += value;
      weekly.push({ label: i === 0 ? "今" : this.weekdayLabel(d), date, value });
    }
    return { weekly, average: sum / 7 };
  }

  /** 只保留最近 60 天历史，避免无限增长 */
  private pruneHistory(history: Record<string, number>): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    const cutoffStr = this.dateString(cutoff);
    for (const date of Object.keys(history)) {
      if (date < cutoffStr) delete history[date];
    }
  }

  private dateString(d: Date): string {
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }

  private weekdayLabel(d: Date): string {
    const names = ["日", "一", "二", "三", "四", "五", "六"];
    return names[d.getDay()];
  }

  private todayString(): string {
    return this.dateString(new Date());
  }
}

export const api = new API();
