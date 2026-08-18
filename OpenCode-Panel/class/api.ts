import { fetch } from "scripting";

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
  async goUsage(): Promise<GoUsage> {
    const res = await fetch(`${this.base}/zen/go/v1/usage`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.token}`,
      },
    });

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error?.message) message = String(body.error.message);
        else if (body?.error?.type) message = String(body.error.type);
      } catch {
        // ignore parse error
      }
      throw new Error(message);
    }

    return (await res.json()) as GoUsage;
  }
}

export const api = new API();
