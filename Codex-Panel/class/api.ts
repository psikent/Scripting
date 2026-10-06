import { fetch } from "scripting";
import { parseResetCardSnapshot, ResetCardSnapshot } from "./reset-cards";

class API {
  private KEY = "setting";

  private base = "https://chatgpt.com";
  token = "";

  constructor() {
    Object.assign(this, Storage.get(this.KEY));
  }

  async save() {
    return Storage.set(this.KEY, {
      token: this.token,
    });
  }

  async getUsage() {
    const response = await fetch(`${this.base}/backend-api/wham/usage`, {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`获取额度失败（HTTP ${response.status}）`);
    }
    return await response.json();
  }

  async getResetCards(): Promise<ResetCardSnapshot> {
    const response = await fetch(`${this.base}/backend-api/wham/rate-limit-reset-credits`, {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`获取重置卡失败（HTTP ${response.status}）`);
    }
    return parseResetCardSnapshot(await response.json());
  }
}

export const api = new API();
