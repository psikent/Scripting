import { fetch, type AbortSignal } from "scripting";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE = "https://auth.openai.com";
const ISSUER = AUTH_BASE; // issuer == auth base in the official device-code flow
const API_BASE = `${AUTH_BASE}/api/accounts`;
const VERIFICATION_URL = `${ISSUER}/codex/device`;
const REDIRECT_URI = `${ISSUER}/deviceauth/callback`;

const KEY_REFRESH_TOKEN = "codex_refresh_token";
const KEY_ACCESS_TOKEN = "codex_access_token";
const KEY_ACCESS_EXPIRES_AT = "codex_access_expires_at";
const KEY_ACCOUNT_EMAIL = "codex_account_email";
const LEGACY_SETTING_KEY = "setting";

const ACCESS_EXPIRY_MARGIN_MS = 60 * 1000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5000;

interface DeviceCodeResponse {
  device_auth_id: string;
  user_code: string;
  /** Seconds, arrives as a JSON string in practice. */
  interval: string;
}

interface DeviceCodeGrant {
  authorization_code: string;
  code_challenge: string;
  code_verifier: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

export interface DeviceCodeChallenge {
  /** URL for the user to open in a browser. */
  verificationUrl: string;
  userCode: string;
}

interface StoredAuth {
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: number;
  accountEmail: string;
}

/** True when any credential exists: OAuth refresh token or a manual token. */
export function hasCredentials(): boolean {
  return Boolean(Keychain.get(KEY_REFRESH_TOKEN) || loadStoredAuth()?.manualToken);
}

/** True when a refresh token is stored (without touching manual tokens). */
export function hasRefreshToken(): boolean {
  return Boolean(Keychain.get(KEY_REFRESH_TOKEN));
}

/**
 * Loads persisted OAuth tokens plus any legacy manually-pasted token.
 * Returns null when neither OAuth nor a manual token exists.
 */
export function loadStoredAuth(): StoredAuth & { manualToken: string } | null {
  const refreshToken = Keychain.get(KEY_REFRESH_TOKEN) ?? "";
  const accessToken = Keychain.get(KEY_ACCESS_TOKEN) ?? "";
  const expiresRaw = Keychain.get(KEY_ACCESS_EXPIRES_AT);
  const accessTokenExpiresAt = expiresRaw ? Number(expiresRaw) : 0;
  const accountEmail = Keychain.get(KEY_ACCOUNT_EMAIL) ?? "";
  const settings = Storage.get<{ token?: string }>(LEGACY_SETTING_KEY);
  const manualToken = settings?.token ?? "";
  if (!refreshToken && !accessToken && !manualToken) {
    return null;
  }
  return { refreshToken, accessToken, accessTokenExpiresAt, accountEmail, manualToken };
}

/** Removes every OAuth secret from Keychain. Manual tokens are untouched. */
export function clearStoredAuth(): void {
  Keychain.remove(KEY_REFRESH_TOKEN);
  Keychain.remove(KEY_ACCESS_TOKEN);
  Keychain.remove(KEY_ACCESS_EXPIRES_AT);
  Keychain.remove(KEY_ACCOUNT_EMAIL);
}

export function getAccountEmail(): string {
  return Keychain.get(KEY_ACCOUNT_EMAIL) ?? "";
}

/** True when a browser-login token or an unexpired cached access token exists. */
export function hasUsableAccessToken(): boolean {
  const stored = loadStoredAuth();
  if (stored === null) return false;
  return stored.manualToken !== "" || Date.now() < stored.accessTokenExpiresAt;
}

/** Requests a one-time code from OpenAI. The user must approve it in a browser. */
export async function beginDeviceLogin(): Promise<DeviceLoginSession> {
  const response = await fetch(`${API_BASE}/deviceauth/usercode`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ client_id: CLIENT_ID }),
    timeout: 15,
  });
  if (!response.ok) {
    throw new Error(`申请设备码失败（HTTP ${response.status}）`);
  }
  const data: DeviceCodeResponse = await response.json();
  const userCode = data.user_code ?? (data as unknown as { usercode?: string }).usercode ?? "";
  if (!userCode) {
    throw new Error("设备码响应缺少 user_code");
  }
  const intervalMs = Math.max(3000, (Number(data.interval) || 5) * 1000);
  const pending: PendingLogin = {
    deviceAuthId: data.device_auth_id,
    userCode,
    intervalMs,
    startedAt: Date.now(),
  };
  return {
    challenge: { verificationUrl: VERIFICATION_URL, userCode },
    complete: (signal?: AbortSignal) => completeDeviceLogin(pending, signal),
  };
}

export interface DeviceLoginSession {
  challenge: DeviceCodeChallenge;
  /** Polls until approved; rejects on timeout, protocol error or abort. */
  complete(signal?: AbortSignal): Promise<void>;
}

interface PendingLogin {
  deviceAuthId: string;
  userCode: string;
  intervalMs: number;
  startedAt: number;
}

/**
 * Polls the device-code endpoint until the user approves or the code expires.
 * 403/404 mean "not approved yet" in the official protocol; anything else aborts.
 * Pass an AbortSignal (e.g. from a cancelled dialog) to stop waiting early.
 */
export async function completeDeviceLogin(pending: PendingLogin, signal?: AbortSignal): Promise<void> {
  while (Date.now() - pending.startedAt < POLL_TIMEOUT_MS) {
    if (signal?.aborted) {
      throw new Error("已取消登录");
    }
    const response = await fetch(`${API_BASE}/deviceauth/token`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        device_auth_id: pending.deviceAuthId,
        user_code: pending.userCode,
      }),
      timeout: 15,
      signal,
    });
    if (response.ok) {
      const grant: DeviceCodeGrant = await response.json();
      await exchangeAndStore(grant);
      return;
    }
    if (response.status === 403 || response.status === 404) {
      await delay(pending.intervalMs, signal);
      continue;
    }
    throw new Error(`设备码授权失败（HTTP ${response.status}）`);
  }
  throw new Error("设备码授权超时，请重试");
}

/** PKCE pair comes from the server; exchange the code for OAuth tokens. */
async function exchangeAndStore(grant: DeviceCodeGrant): Promise<void> {
  const tokens = await requestTokenExchange({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code: grant.authorization_code,
    code_verifier: grant.code_verifier,
  });
  persistTokens(tokens);
}

export interface RefreshResult {
  ok: boolean;
  /** True when refresh was refused, meaning the user must log in again. */
  invalidated: boolean;
}

/**
 * Refreshes the access token with the stored refresh token.
 * Returns invalidated=true when OpenAI rejects the refresh token.
 */
export async function refreshAccessToken(): Promise<RefreshResult> {
  const refreshToken = Keychain.get(KEY_REFRESH_TOKEN);
  if (!refreshToken) {
    return { ok: false, invalidated: false };
  }
  try {
    const tokens = await requestTokenExchange({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    });
    persistTokens(tokens);
    return { ok: true, invalidated: false };
  } catch (error: unknown) {
    const status = (error as { status?: unknown } | null)?.status;
    if (status === 400 || status === 401 || status === 403) {
      clearStoredAuth();
      return { ok: false, invalidated: true };
    }
    return { ok: false, invalidated: false };
  }
}

async function requestTokenExchange(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(body),
    timeout: 15,
  });
  if (!response.ok) {
    throw Object.assign(new Error(`令牌请求失败（HTTP ${response.status}）`), {
      status: response.status,
    });
  }
  const tokens: TokenResponse = await response.json();
  if (!tokens.access_token) {
    throw new Error("令牌响应缺少 access_token");
  }
  return tokens;
}

function persistTokens(tokens: TokenResponse): void {
  const expiresInSeconds = tokens.expires_in ?? 3600;
  const expiresAt = Date.now() + expiresInSeconds * 1000 - ACCESS_EXPIRY_MARGIN_MS;
  if (!Keychain.set(KEY_ACCESS_TOKEN, tokens.access_token)) {
    throw new Error("无法写入 Keychain");
  }
  // Only overwrite the refresh token when the server rotates it.
  if (tokens.refresh_token) {
    Keychain.set(KEY_REFRESH_TOKEN, tokens.refresh_token);
  }
  Keychain.set(KEY_ACCESS_EXPIRES_AT, String(expiresAt));
  const email = extractEmail(tokens.id_token ?? "");
  if (email) {
    Keychain.set(KEY_ACCOUNT_EMAIL, email);
  }
}

/** Decodes the id_token JWT payload to surface the account email (best effort). */
function extractEmail(idToken: string): string {
  if (!idToken) return "";
  try {
    const payloadPart = idToken.split(".")[1] ?? "";
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = Data.fromBase64String(padded)?.toRawString();
    if (!json) return "";
    const email = (JSON.parse(json) as { email?: unknown }).email;
    return typeof email === "string" ? email : "";
  } catch {
    return "";
  }
}

function encodeForm(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve: () => void, reject: (reason: Error) => void) => {
    const timer = setTimeout(finish, ms);
    function finish(): void {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort(): void {
      clearTimeout(timer);
      reject(new Error("已取消登录"));
    }
    signal?.addEventListener("abort", onAbort);
  });
}
