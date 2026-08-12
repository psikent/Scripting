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

class API {
  private readonly KEY = "deepseek_setting";
  private readonly SPEND_KEY = "deepseek_spend_record";
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
   * 计算当天开销（本地差值估算）。
   * DeepSeek 无用量统计接口，故以当天首次观察到的余额为基线：
   *   当日开销 = 基线 - (当前余额 - 当日累计充值额)
   * 余额相对上次观察跳升时，差值计入当日充值额（充值/赠送），
   * 因此充值不会清零已累计的开销，充值后的消费也能继续累计。
   * 跨天或无有效记录时初始化基线并返回 0。
   */
  getTodaySpend(total: number): number {
    const today = this.todayString();
    const record = Storage.get<SpendRecord>(this.SPEND_KEY);

    // 跨天 / 无记录 / 旧格式数据（缺 toppedUp、lastTotal）：重新建档
    if (
      !record ||
      record.date !== today ||
      typeof record.baseline !== "number" ||
      typeof record.toppedUp !== "number" ||
      typeof record.lastTotal !== "number"
    ) {
      Storage.set(this.SPEND_KEY, {
        date: today,
        baseline: total,
        toppedUp: 0,
        lastTotal: total,
      });
      return 0;
    }

    // 余额跳升 = 充值/赠送（两次观察之间的净值）
    if (total > record.lastTotal) {
      record.toppedUp += total - record.lastTotal;
    }
    record.lastTotal = total;

    const spend = record.baseline - (total - record.toppedUp);
    const result = spend > 0 ? spend : 0;
    Storage.set(this.SPEND_KEY, record);
    return result;
  }

  private todayString(): string {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }
}

export const api = new API();
