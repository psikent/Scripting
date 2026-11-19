import { Button, Script, Text, Widget, type AbortSignal } from "scripting"
import { ReloadIntent } from "./app_intents"
import { api } from "./class/api"
import { loadStoredAuth } from "./class/auth"
import { resolveRateLimitWindows, type RateLimitWindow, type RateLimitWindows } from "./class/usage"
import { loadWidgetData, type WidgetLoadResult } from "./class/widget-load"
import { type ResetCardSnapshot } from "./class/reset-cards"
import { type ResetCardLoadState } from "./widget/small"
import { View as Circle } from "./widget/circular"
import { View as Small } from "./widget/small"

type UsageSnapshot = { rate_limit: unknown }

/** Widget cache key is bound to the credential, not the raw token string. */
function accountTag(): string {
  const stored = loadStoredAuth()
  const identity = stored?.refreshToken || stored?.accessToken || stored?.manualToken || "anonymous"
  const data = Data.fromRawString(identity)
  return data ? Crypto.sha256(data).toHexString() : ""
}

async function loadUsage(signal: AbortSignal): Promise<UsageSnapshot> {
  const data: UsageSnapshot = await api.getUsage(signal)
  return { rate_limit: data.rate_limit }
}

;(async (): Promise<void> => {
  if (!api.authenticated) throw new Error("请先在 App 内登录")
  const tag = accountTag()

  switch (Widget.family) {
    case "accessoryCircular": {
      const result: WidgetLoadResult<UsageSnapshot> = await loadWidgetData<UsageSnapshot>("widget_usage_v1", tag, loadUsage)
      if (!result.data) throw new Error("请求超时或失败，请打开应用检查网络与登录状态")
      const windows: RateLimitWindows = resolveRateLimitWindows(result.data.rate_limit)
      const primaryWindow: RateLimitWindow | null = windows.fiveHour ?? windows.weekly
      if (!primaryWindow) throw new Error("暂无可用的限额数据")
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Circle remainingPercent={100 - primaryWindow.used_percent} stale={result.stale} />
        </Button>,
      )
      break
    }
    case "systemSmall": {
      const [usage, cards]: [WidgetLoadResult<UsageSnapshot>, WidgetLoadResult<ResetCardSnapshot>] = await Promise.all([
        loadWidgetData<UsageSnapshot>("widget_usage_v1", tag, loadUsage),
        loadWidgetData<ResetCardSnapshot>("widget_reset_cards_v1", tag, (signal: AbortSignal) => api.getResetCards(signal)),
      ])
      const weekly: RateLimitWindow | null = usage.data
        ? resolveRateLimitWindows(usage.data.rate_limit).weekly
        : null
      const resetCards: ResetCardLoadState = cards.data
        ? { kind: "success", snapshot: cards.data }
        : { kind: "failure" }
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Small weekly={weekly} resetCards={resetCards} stale={usage.stale || cards.stale} />
        </Button>,
      )
      break
    }
    default:
      throw new Error("未适配的 Widget 尺寸")
  }
})().catch((error: unknown) => {
  const message: string = error instanceof Error ? error.message : "加载小组件失败"
  Widget.present(<Text>{message}</Text>)
}).finally(() => Script.exit())
