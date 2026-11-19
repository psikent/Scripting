export interface RateLimitWindow {
  used_percent: number;
  reset_at: number;
  limit_window_seconds?: number;
}

export interface RateLimitWindows {
  fiveHour: RateLimitWindow | null;
  weekly: RateLimitWindow | null;
}

const LONG_WINDOW_THRESHOLD_SECONDS = 24 * 60 * 60;

function normalizeWindow(value: any): RateLimitWindow | null {
  if (!value || typeof value !== "object") return null;

  const usedPercent = Number(value.used_percent);
  const resetAt = Number(value.reset_at);
  const windowSeconds = Number(value.limit_window_seconds);
  if (!Number.isFinite(usedPercent) || !Number.isFinite(resetAt)) return null;

  return {
    used_percent: Math.max(0, Math.min(100, usedPercent)),
    reset_at: resetAt,
    ...(Number.isFinite(windowSeconds) && windowSeconds > 0
      ? { limit_window_seconds: windowSeconds }
      : {}),
  };
}

/**
 * 优先根据窗口自身的时长识别 5 小时和每周限额，避免依赖 primary/secondary 的位置。
 * 仅在旧双窗口响应都缺少时长时，才按 historical primary=短窗口、secondary=长窗口兼容；
 * 单窗口且缺少时长时无法可靠判断，按旧版行为归为每周窗口，避免伪造 5 小时限额。
 */
export function resolveRateLimitWindows(rateLimit: any): RateLimitWindows {
  const primary = normalizeWindow(rateLimit?.primary_window);
  const secondary = normalizeWindow(rateLimit?.secondary_window);
  const windows = [primary, secondary].filter((window): window is RateLimitWindow => window !== null);

  let fiveHour =
    windows.find(
      (window) =>
        window.limit_window_seconds !== undefined &&
        window.limit_window_seconds <= LONG_WINDOW_THRESHOLD_SECONDS,
    ) ?? null;
  let weekly =
    windows.find(
      (window) =>
        window.limit_window_seconds !== undefined &&
        window.limit_window_seconds > LONG_WINDOW_THRESHOLD_SECONDS,
    ) ?? null;

  if (windows.length >= 2) {
    fiveHour ??= windows.find((window) => window !== weekly) ?? null;
    weekly ??= windows.find((window) => window !== fiveHour) ?? null;
  } else if (windows.length === 1 && fiveHour === null && weekly === null) {
    weekly = windows[0];
  }

  return { fiveHour, weekly };
}
