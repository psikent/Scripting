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

  constructor() {
    const saved = Storage.get<{ token?: string }>(this.KEY);
    if (saved) Object.assign(this, saved);
  }

  save() {
    return Storage.set(this.KEY, { token: this.token });
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
