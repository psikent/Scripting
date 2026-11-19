import { fetch, type AbortSignal } from "scripting";
import { parseResetCardSnapshot, ResetCardSnapshot } from "./reset-cards";
import {
  getAccountEmail,
  hasCredentials,
  hasRefreshToken,
  loadStoredAuth,
  refreshAccessToken,
} from "./auth";

class API {
  private KEY = "setting";

  private base = "https://chatgpt.com";
  /** Legacy manually-pasted token. Kept writable for backward compatibility. */
  token = "";

  constructor() {
    Object.assign(this, Storage.get(this.KEY));
  }

  async save() {
    return Storage.set(this.KEY, {
      token: this.token,
    });
  }

  get accountEmail(): string {
    return getAccountEmail();
  }

  /** True when any usable credential exists (OAuth or manual token). */
  get authenticated(): boolean {
    return hasCredentials();
  }

  async getUsage(signal?: AbortSignal) {
    return this.authorizedJson(
      `${this.base}/backend-api/wham/usage`,
      `获取额度失败（HTTP `,
      signal,
    );
  }

  async getResetCards(signal?: AbortSignal): Promise<ResetCardSnapshot> {
    const data = await this.authorizedJson(
      `${this.base}/backend-api/wham/rate-limit-reset-credits`,
      `获取重置卡失败（HTTP `,
      signal,
    );
    return parseResetCardSnapshot(data);
  }

  /**
   * GET with the best available bearer token. On 401 it refreshes the OAuth
   * access token once and retries; manual tokens are never refreshable.
   */
  private async authorizedJson(
    url: string,
    errorMessagePrefix: string,
    signal?: AbortSignal,
  ): Promise<any> {
    const attempt = async (bearer: string) => {
      const response = await fetch(url, {
        timeout: 4,
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearer}`,
        },
      });
      if (!response.ok) {
        throw Object.assign(new Error(`${errorMessagePrefix}${response.status}）`), {
          status: response.status,
        });
      }
      return await response.json();
    };

    const bearer = await this.resolveBearer();
    try {
      return await attempt(bearer);
    } catch (error: unknown) {
      const status = (error as { status?: unknown } | null)?.status;
      if (status === 401 && await this.tryRefresh()) {
        const refreshed = await this.resolveBearer();
        return attempt(refreshed);
      }
      throw error;
    }
  }

  /** Cached access token; refreshes proactively when expired or missing. */
  private async resolveBearer(): Promise<string> {
    const stored = loadStoredAuth();
    if (stored === null) {
      return this.token;
    }
    if (Date.now() < stored.accessTokenExpiresAt) {
      return stored.accessToken;
    }
    await this.tryRefresh();
    const after = loadStoredAuth();
    if (after !== null && Date.now() < after.accessTokenExpiresAt) {
      return after.accessToken;
    }
    if (this.token) {
      return this.token;
    }
    throw new Error("登录已失效，请重新在设置中登录");
  }

  /** Refresh attempt; false when there is no refresh token or it failed. */
  private async tryRefresh(): Promise<boolean> {
    if (!hasRefreshToken()) {
      return false;
    }
    const result = await refreshAccessToken();
    if (result.invalidated) {
      throw new Error("登录已失效，请重新在设置中登录");
    }
    return result.ok;
  }
}

export const api = new API();
