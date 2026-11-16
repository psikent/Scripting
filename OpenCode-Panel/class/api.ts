import { fetch, type AbortSignal } from "scripting";

/** Go 限额单个窗口 */
export type GoWindow = {
  status: "ok" | "rate-limited";
  percent: number;
  resetsAt: string;
};

/** GET /zen/go/v1/usage 响应 */
export type GoUsage = {
  usage: {
    rolling: GoWindow;
    weekly: GoWindow;
    monthly: GoWindow;
  };
};

/** 各窗口名称与官方限额（opencode 计费侧硬编码） */
export const WINDOW_META = {
  rolling: { label: "5 小时", limit: 12 },
  weekly: { label: "1 周", limit: 30 },
  monthly: { label: "1 月", limit: 60 },
} as const;

export type WindowKey = keyof typeof WINDOW_META;

/** 将 API 返回的已用百分比转换为剩余百分比 */
export function remainingPercent(usedPercent: number): number {
  return Math.max(0, Math.min(100, 100 - usedPercent));
}

class API {
  private KEY = "opencode_setting";

  private base = "https://opencode.ai";
  token = "";

  constructor() {
    Object.assign(this, Storage.get(this.KEY));
  }

  async save() {
    return Storage.set(this.KEY, {
      token: this.token,
    });
  }

  /** OpenCode Go 订阅三窗口限额（rolling 5h / weekly / monthly） */
  async goUsage(signal?: AbortSignal): Promise<GoUsage> {
    const res = await fetch(`${this.base}/zen/go/v1/usage`, {
      timeout: 4,
      signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.token}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error(`鉴权失败（HTTP ${res.status}）`), { status: res.status });
      }
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error?.message) message = String(body.error.message);
        else if (body?.error?.type) message = String(body.error.type);
      } catch {
        // ignore parse error
      }
      throw Object.assign(new Error(message), { status: res.status });
    }

    return (await res.json()) as GoUsage;
  }
}

export const api = new API();
