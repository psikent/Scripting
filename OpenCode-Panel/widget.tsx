import { Button, Script, Text, Widget, type AbortSignal } from "scripting"
import { ReloadIntent } from "./app_intents"
import { api, remainingPercent, type GoUsage } from "./class/api"
import { loadWidgetData, type WidgetLoadResult } from "./class/widget-load"
import { View as Circle } from "./widget/circular"
import { View as Small } from "./widget/small"

;(async (): Promise<void> => {
  if (!api.token) throw new Error("请先在设置页填写 API Key")
  if (Widget.family !== "accessoryCircular" && Widget.family !== "systemSmall") {
    throw new Error("未适配的 Widget 尺寸")
  }
  const result: WidgetLoadResult<GoUsage> = await loadWidgetData<GoUsage>(
    "widget_go_usage_v1",
    api.token,
    (signal: AbortSignal) => api.goUsage(signal),
  )
  if (!result.data) throw new Error("请求超时或失败，请打开应用检查网络与 API Key")
  const data: GoUsage = result.data

  switch (Widget.family) {
    case "accessoryCircular":
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Circle percent={remainingPercent(data.usage.weekly.percent)} stale={result.stale} />
        </Button>,
      )
      break
    case "systemSmall":
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Small usage={data.usage} stale={result.stale} />
        </Button>,
      )
      break
  }
})().catch((error: unknown) => {
  const message: string = error instanceof Error ? error.message : "加载小组件失败"
  Widget.present(<Text>{message}</Text>)
}).finally(() => Script.exit())
