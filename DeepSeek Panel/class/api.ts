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
   * DeepSeek 无用量统计接口，故以当天首次观察到的余额为基线，
   * 当天开销 = 基线 - 当前余额。跨天时重置基线并返回 0。
   * 当天充值导致余额增加时，重置基线并从新基线重新累计。
   */
  getTodaySpend(total: number): number {
    const today = this.todayString();
    const record = Storage.get<SpendRecord>(this.SPEND_KEY);

    if (!record || record.date !== today || typeof record.baseline !== "number") {
      Storage.set(this.SPEND_KEY, { date: today, baseline: total });
      return 0;
    }

    const spend = record.baseline - total;
    if (spend < 0) {
      // 充值/赠送导致余额增加：重置基线，避免后续消费被充值额吞掉
      Storage.set(this.SPEND_KEY, { date: today, baseline: total });
      return 0;
    }
    return spend;
  }

  private todayString(): string {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }
}

export const api = new API();
