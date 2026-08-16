import { fetch } from "scripting";

export interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

export interface BalanceResponse {
  is_available: boolean;
  balance_infos: BalanceInfo[];
}

interface SpendRecord {
  /** 本地时区日期，格式 YYYY-MM-DD */
  date: string;
  /** 当天首次观察到的总余额（基线） */
  baseline: number;
  /** 当天累计充值/赠送金额（通过余额跳升检测，净值） */
  toppedUp: number;
  /** 上次刷新时观察到的总余额 */
  lastTotal: number;
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
  /** 7 日平均开销（基线） */
  average: number;
}

class API {
  private readonly KEY = "deepseek_setting";
  private readonly SPEND_KEY = "deepseek_spend_record";
  private readonly HISTORY_KEY = "deepseek_spend_history";
  private readonly base = "https://api.deepseek.com";

  token = "";

  constructor() {
    const saved = Storage.get<{ token?: string }>(this.KEY);
    if (saved) Object.assign(this, saved);
  }

  save() {
    return Storage.set(this.KEY, { token: this.token });
  }

  /** 查询账户余额（官方 GET /user/balance） */
  async getBalance(): Promise<BalanceResponse> {
    const res = await fetch(`${this.base}/user/balance`, {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // 网关返回非 JSON（如 502 HTML 页面）时兜底
    }
    if (!res.ok) {
      const message = json?.error?.message;
      throw new Error(message ? `余额查询失败: ${message}` : `余额查询失败 (${res.status})`);
    }
    return json as BalanceResponse;
  }

  /**
   * 计算当天开销（本地差值估算），并写入每日历史。
   * DeepSeek 无用量统计接口，故以当天首次观察到的余额为基线：
   *   当日开销 = 基线 - (当前余额 - 当日累计充值额)
   * 余额相对上次观察跳升时，差值计入当日充值额（充值/赠送），
   * 因此充值不会清零已累计的开销，充值后的消费也能继续累计。
   * 跨天时先把前一天最终开销写入历史，再为新的一天建档并返回 0。
   */
  getTodaySpend(total: number): number {
    const today = this.todayString();
    const record = Storage.get<SpendRecord>(this.SPEND_KEY);
    const history = Storage.get<Record<string, number>>(this.HISTORY_KEY) ?? {};

    // 跨天：把前一天最终开销写入历史
    if (
      record &&
      record.date &&
      record.date !== today &&
      typeof record.baseline === "number" &&
      typeof record.toppedUp === "number" &&
      typeof record.lastTotal === "number"
    ) {
      history[record.date] = Math.max(
        0,
        record.baseline - (record.lastTotal - record.toppedUp),
      );
    }

    const valid =
      record &&
      record.date === today &&
      typeof record.baseline === "number" &&
      typeof record.toppedUp === "number" &&
      typeof record.lastTotal === "number";

    let spend = 0;
    if (!valid) {
      // 无记录 / 跨天 / 旧格式数据：重新建档
      Storage.set(this.SPEND_KEY, {
        date: today,
        baseline: total,
        toppedUp: 0,
        lastTotal: total,
      });
    } else {
      // 余额跳升 = 充值/赠送（两次观察之间的净值）
      if (total > record.lastTotal) {
        record.toppedUp += total - record.lastTotal;
      }
      record.lastTotal = total;
      spend = Math.max(0, record.baseline - (total - record.toppedUp));
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
