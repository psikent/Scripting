/**
 * Surge 日志分析器 - 主界面
 */

import { Script, Navigation, NavigationStack, List, VStack, HStack, Text, ScrollView, TextField, Button, Chart, LineChart, Section, Rectangle, useMemo, useObservable, useEffect, Slider, Spacer } from "scripting"
import {
  createDiagnosticCollector,
  ensureICloudFileDownloaded,
  readNonEmptyTextAsync,
} from "./log-files"
import { parseLog, selectVisibleEntries } from "./parser"
import type { LogEntry, LogLevel, ParseResult, MemoryDataPoint, ObservableValue } from "./types"
import { LOG_LEVEL_CONFIG } from "./types"

const APP_DIAGNOSTICS = createDiagnosticCollector("app")
const LEVEL_ORDER: Array<"ALL" | LogLevel> = ["ALL", "ERROR", "WARN", "NOTICE", "INFO", "DEBUG", "VERBOSE", "UNKNOWN"]
const LEVEL_FILTERS = LEVEL_ORDER.map(key => key === "ALL"
  ? { key, label: "全部", color: "#8E8E93" }
  : { key, label: LOG_LEVEL_CONFIG[key].label, color: LOG_LEVEL_CONFIG[key].color })

function App() {
  const dismiss = Navigation.useDismiss()
  const currentData = useObservable<ParseResult | null>(null)
  const currentFilePath = useObservable<string | null>(null)
  const selectedLevel = useObservable(0)
  const searchText = useObservable("")
  const sliderIndex = useObservable(0)
  const committedSliderIndex = useObservable(0)
  const showAllTime = useObservable(false)
  const result = currentData.value
  const openFile = async () => {
    let hasSecurityScopedResources = false
    try {
      const paths = await DocumentPicker.pickFiles()
      if (!paths || paths.length === 0) {
        APP_DIAGNOSTICS.note("pick log file", "cancelled")
        return
      }
      hasSecurityScopedResources = true
      const content = await tryReadFile(paths[0])
      if (content) {
        sliderIndex.setValue(0)
        committedSliderIndex.setValue(0)
        showAllTime.setValue(false)
        currentData.setValue(parseLog(content))
        currentFilePath.setValue(paths[0])
      }
    } catch (error) {
      APP_DIAGNOSTICS.capture("open selected file", error)
    } finally {
      if (hasSecurityScopedResources) stopAccessingDocumentPickerResources("open selected file")
    }
  }
  return <NavigationStack>
    <List navigationTitle="Surge 日志分析器" navigationBarTitleDisplayMode="inline"
      toolbar={{
        topBarLeading: <Button title="打开" systemImage="folder" action={openFile} />,
        topBarTrailing: <Button title="完成" action={dismiss} />
      }}>
      {result && result.entries.length > 0 ? <>
        <MemorySection memoryPoints={result.memoryPoints} memoryStats={result.memoryStats} sliderIndex={sliderIndex} committedSliderIndex={committedSliderIndex} filePath={currentFilePath.value} showAllTime={showAllTime} />
        <LogSection entries={result.entries} memoryPoints={result.memoryPoints} selectedLevel={selectedLevel} searchText={searchText} sliderIndex={committedSliderIndex} showAllTime={showAllTime} />
      </> : <EmptyState onOpenFile={openFile} />}
    </List>
  </NavigationStack>
}

interface MemorySectionProps {
  memoryPoints: MemoryDataPoint[]
  memoryStats: ParseResult["memoryStats"]
  sliderIndex: ObservableValue<number>
  committedSliderIndex: ObservableValue<number>
  filePath: string | null
  showAllTime: ObservableValue<boolean>
}

const MIN_POINT_SPACING = 22

function MemorySection({ memoryPoints, memoryStats, sliderIndex, committedSliderIndex, filePath, showAllTime }: MemorySectionProps) {
  const fmt = (v: number) => v.toFixed(1) + " MB"
  const pointCount = memoryPoints.length
  const idx = Math.min(pointCount - 1, Math.max(0, Math.round(sliderIndex.value)))
  const currentPoint = pointCount > 0 ? memoryPoints[idx] : null
  const crossesDay = pointCount > 1 && !isSameLocalDay(memoryPoints[0].timestamp, memoryPoints[pointCount - 1].timestamp)

  // 横向滚动：根据数据点数量计算图表宽度，保证最小间隔
  const chartWidth = Math.max(340, pointCount * MIN_POINT_SPACING)
  const scrollTargetId = useObservable<string>(pointCount > 0 ? "pt-0" : "")

  // 滑块移动时，图表跟随滚动到当前选中点
  useEffect(() => {
    if (pointCount > 0 && idx >= 0) {
      scrollTargetId.setValue(`pt-${idx}`)
    }
  }, [idx, pointCount])

  const chartMarks = useMemo(() => memoryPoints.map((point, index) => ({
    label: formatChartTime(point.timestamp),
    value: point.value,
    foregroundStyle: { color: "#4A90D9" as const, opacity: 1 },
    interpolationMethod: "linear" as const,
    symbol: "circle" as const,
    symbolSize: index === idx ? { width: 14, height: 14 } : { width: 5, height: 5 },
  })), [memoryPoints, idx])

  // 用于对齐图表数据点的不可见标记视图
  const scrollMarkers = useMemo(() => {
    if (pointCount === 0) return null
    const markerWidth = chartWidth / pointCount
    return (
      <HStack scrollTargetLayout spacing={0}>
        {memoryPoints.map((_, i) => (
          <Rectangle key={`pt-${i}`} fill="clear" frame={{ width: markerWidth, height: 0 }} />
        ))}
      </HStack>
    )
  }, [memoryPoints, chartWidth, pointCount])

  return <Section title="📊 内存曲线">
    <VStack spacing={12} padding={{ vertical: 8 }} alignment="leading">
    {filePath ? <HStack spacing={4}><Text font="caption2">📄</Text><Text font="caption2">{filePath}</Text></HStack> : null}
    <HStack alignment="top" frame={{ maxWidth: "infinity" }}>
      <Spacer />
      <StatCell title="最高" value={fmt(memoryStats.max)} subtitle={memoryStats.maxTime.getTime() > 0 ? formatMemoryTime(memoryStats.maxTime, crossesDay, true) : undefined} />
      <Spacer />
      <StatCell title="平均" value={fmt(memoryStats.avg)} />
      <Spacer />
      <StatCell title="最低" value={fmt(memoryStats.min)} subtitle={memoryStats.minTime.getTime() > 0 ? formatMemoryTime(memoryStats.minTime, crossesDay, true) : undefined} />
      <Spacer />
    </HStack>
    {memoryPoints.length > 0 ? <ScrollView
      axes="horizontal"
      scrollIndicator={{ visibility: "hidden", axes: "horizontal" }}
      scrollPosition={{ value: scrollTargetId, anchor: "center" }}
    >
      <VStack>
        <Chart
          frame={{ width: chartWidth, height: 200 }}
          padding={{ top: 8, trailing: 8 }}
          chartXAxis={{
            values: { type: "automatic", desiredCount: 5 },
            valueLabel: { collisionResolution: "greedy" },
          }}
        >
          <LineChart marks={chartMarks} />
        </Chart>
        {scrollMarkers}
      </VStack>
    </ScrollView> : <VStack alignment="center" padding={20}><Text font="subheadline">未提取到内存数据</Text></VStack>}
    {currentPoint ? <HStack alignment="center" frame={{ maxWidth: "infinity" }} padding={{ vertical: 2 }}><Text font="caption" bold>📍 {formatMemoryTime(currentPoint.timestamp, crossesDay, true)} — {currentPoint.value.toFixed(1)} MB</Text></HStack> : <Text font="caption2" padding={{ vertical: 2 }}>—</Text>}
    {pointCount > 0 && <>
      <Slider
        tint="#48484A"
        value={sliderIndex.value}
        min={0}
        max={pointCount - 1}
        step={1}
        onChanged={value => sliderIndex.setValue(value)}
        onEditingChanged={editing => {
          if (!editing) {
            committedSliderIndex.setValue(Math.round(sliderIndex.value))
            showAllTime.setValue(false)
          }
        }}
        label={<Text font="caption2">滑动选择数据点，松手后更新日志</Text>}
      />
      <HStack><Text font="caption2">{formatMemoryTime(memoryPoints[0].timestamp, crossesDay, false)}</Text><Spacer /><Text font="caption2">{formatMemoryTime(memoryPoints[pointCount - 1].timestamp, crossesDay, false)}</Text></HStack>
    </>}
    <HStack><Text font="caption2">共 {memoryPoints.length} 条内存记录</Text></HStack>
  </VStack></Section>
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatChartTime(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatMemoryTime(date: Date, includeDate: boolean, includeSeconds: boolean): string {
  const pad = (value: number) => value.toString().padStart(2, "0")
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}${includeSeconds ? `:${pad(date.getSeconds())}` : ""}`
  return includeDate ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}` : time
}

interface StatCellProps {
  title: string
  value: string
  subtitle?: string
}

function StatCell({ title, value, subtitle }: StatCellProps) {
  return <VStack alignment="center" spacing={2} frame={{ minWidth: 0 }} padding={{ horizontal: 4, vertical: 6 }}><Text font="caption2">{title}</Text><Text font="caption" bold>{value}</Text>{subtitle ? <Text font="caption2">{subtitle}</Text> : null}</VStack>
}

interface LogSectionProps {
  entries: LogEntry[]
  memoryPoints: MemoryDataPoint[]
  selectedLevel: ObservableValue<number>
  searchText: ObservableValue<string>
  sliderIndex: ObservableValue<number>
  showAllTime: ObservableValue<boolean>
}

function LogSection({ entries, memoryPoints, selectedLevel, searchText, sliderIndex, showAllTime }: LogSectionProps) {
  const levelKey = LEVEL_ORDER[selectedLevel.value] ?? "ALL"
  const visible = selectVisibleEntries(entries, memoryPoints, levelKey === "ALL" ? null : levelKey, searchText.value, sliderIndex.value, showAllTime.value)

  return <Section title={`📋 日志浏览 (${entries.length} 条)`}>
    <VStack spacing={12} padding={{ vertical: 8 }}>
      {/* 级别筛选按钮 */}
      <ScrollView axes="horizontal" scrollIndicator={{ visibility: "hidden", axes: "horizontal" }}>
        <HStack spacing={6}>
          {LEVEL_FILTERS.map((item, index) => (
            <Button
              key={item.key}
              title={item.label}
              action={() => selectedLevel.setValue(index)}
              controlSize="small"
              tint={selectedLevel.value === index ? item.color : "#3A3A3C"}
            />
          ))}
        </HStack>
      </ScrollView>

      {/* 搜索框 */}
      <TextField
        value={searchText.value}
        placeholder="搜索日志内容或模块名..."
        onChanged={value => searchText.setValue(value)}
        clearButtonMode="whileEditing"
      />

      {/* 日志列表 */}
      {visible.entries.length > 0 ? (
        <>
          <Section>
            {visible.entries.map(entry => (
              <LogRow key={entry.line} entry={entry} />
            ))}
          </Section>
          <HStack frame={{ maxWidth: "infinity" }}>
            <Text font="caption2">显示 {visible.entries.length} / {entries.length} 条</Text>
            <Spacer />
            <Text font="caption2">{visible.startTime} - {visible.endTime}</Text>
            <Spacer />
            <Button title="重置" action={() => { selectedLevel.setValue(0); searchText.setValue(""); sliderIndex.setValue(0); showAllTime.setValue(false) }} controlSize="small" />
          </HStack>
        </>
      ) : (
        <VStack alignment="center" padding={20}>
          <Text font="subheadline">没有匹配的日志条目</Text>
          <Text font="caption2" multilineTextAlignment="center" frame={{ maxWidth: "infinity" }} padding={{ top: 4 }}>
            尝试调整筛选条件或搜索关键词
          </Text>
        </VStack>
      )}
    </VStack>
  </Section>
}

interface LogRowProps {
  entry: LogEntry
}

const LOG_DATE_STYLES: Record<string, { color: string; weight: string }> = {
  ERROR:   { color: "#FF3B30", weight: "bold" },
  WARN:    { color: "#FF9500", weight: "bold" },
  NOTICE:  { color: "#34C759", weight: "regular" },
  INFO:    { color: "#007AFF", weight: "regular" },
  DEBUG:   { color: "#5AC8FA", weight: "regular" },
  VERBOSE: { color: "#AF52DE", weight: "regular" },
  UNKNOWN: { color: "#8E8E93", weight: "regular" },
}

function LogRow({ entry }: LogRowProps) {
  const style = LOG_DATE_STYLES[entry.level] ?? LOG_DATE_STYLES.UNKNOWN
  return (
    <VStack alignment="leading" spacing={2} padding={{ vertical: 4 }} frame={{ maxWidth: "infinity" }}>
      <HStack spacing={6}>
        <Text font="caption2" foregroundStyle={{ color: style.color }}>{entry.timeString}</Text>
        <Text font="caption2" bold foregroundStyle={{ color: style.color }}>{entry.level}</Text>
        {entry.module ? <Text font="caption2" foregroundStyle={{ color: "#8E8E93" }}>[{entry.module}]</Text> : null}
      </HStack>
      <Text font="caption" foregroundStyle={{ color: "#FFFFFF" }}>{entry.message}</Text>
    </VStack>
  )
}

function EmptyState({ onOpenFile }: { onOpenFile: () => void }) {
  return (
    <Section>
      <VStack alignment="center" spacing={12} padding={{ top: 80, bottom: 40 }}>
        <Text font="largeTitle">📂</Text>
        <Text font="title3" bold>Surge 日志分析器</Text>
        <Text font="subheadline" multilineTextAlignment="center" frame={{ maxWidth: "infinity" }}>
          选择 Surge 日志文件开始分析{"\n"}支持内存曲线、模块分布和详细日志浏览
        </Text>
        <Button title="选择日志文件" systemImage="folder" action={onOpenFile} controlSize="regular" tint="#007AFF" />
      </VStack>
    </Section>
  )
}

Script.open({ widgetName: undefined, family: undefined }, () => <App />)