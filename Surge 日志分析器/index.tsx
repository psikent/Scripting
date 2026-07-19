/**
 * Surge 日志分析器 - 主界面
 */

import { Script, Navigation, NavigationStack, List, VStack, HStack, Text, ScrollView, TextField, Button, Chart, LineChart, Section, Rectangle, useMemo, useObservable, Slider, Spacer } from "scripting"
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

function MemorySection({ memoryPoints, memoryStats, sliderIndex, committedSliderIndex, filePath, showAllTime }: MemorySectionProps) {
  const fmt = (v: number) => v.toFixed(1) + " MB"
  const pointCount = memoryPoints.length
  const idx = Math.min(pointCount - 1, Math.max(0, Math.round(sliderIndex.value)))
  const currentPoint = pointCount > 0 ? memoryPoints[idx] : null
  const crossesDay = pointCount > 1 && !isSameLocalDay(memoryPoints[0].timestamp, memoryPoints[pointCount - 1].timestamp)
  const chartMarks = useMemo(() => memoryPoints.map((point, index) => ({
    label: formatChartTime(point.timestamp),
    value: point.value,
    foregroundStyle: { color: "#4A90D9" as const, opacity: 1 },
    interpolationMethod: "linear" as const,
    symbol: "circle" as const,
    symbolSize: index === idx ? { width: 14, height: 14 } : { width: 5, height: 5 },
  })), [memoryPoints, idx])
  return <Section title="📊 内存曲线">
    <VStack spacing={12} padding={{ vertical: 8 }} alignment="leading">
    {filePath ? <HStack spacing={4}><Text font="caption2">📄</Text><Text font="caption2">{filePath}</Text></HStack> : null}
    <HStack spacing={0} alignment="center" frame={{ maxWidth: "infinity" }}>
      <StatCell title="当前" value={fmt(memoryStats.latest)} />
      <StatCell title="最高" value={fmt(memoryStats.max)} />
      <StatCell title="最低" value={fmt(memoryStats.min)} />
      <StatCell title="平均" value={fmt(memoryStats.avg)} />
    </HStack>
    {memoryPoints.length > 0 ? <Chart
      frame={{ height: 200 }}
      chartXAxis={{
        values: { type: "automatic", desiredCount: 5 },
        valueLabel: { collisionResolution: "greedy" },
      }}
    >
      <LineChart marks={chartMarks} />
    </Chart> : <VStack alignment="center" padding={20}><Text font="subheadline">未提取到内存数据</Text></VStack>}
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
}

function StatCell({ title, value }: StatCellProps) {
  return <VStack alignment="center" spacing={3} frame={{ minWidth: 0 }} padding={{ horizontal: 4, vertical: 8 }}><Text font="caption2">{title}</Text><Text font="caption" bold>{value}</Text></VStack>
}

interface LogSectionProps {
  entries: LogEntry[]
  memoryPoints: MemoryDataPoint[]
  selectedLevel: ObservableValue<number>
  searchText: ObservableValue<string>
  sliderIndex: Pick<ObservableValue<number>, "value">
  showAllTime: ObservableValue<boolean>
}

function LogSection({ entries, memoryPoints, selectedLevel, searchText, sliderIndex, showAllTime }: LogSectionProps) {
  // 从左到右严重程度逐渐下降：全部 → ERROR → WARN → NOTICE → INFO → DEBUG → VERBOSE → UNKNOWN
  const curKey = LEVEL_FILTERS[selectedLevel.value].key
  const idx = Math.min(memoryPoints.length - 1, Math.max(0, Math.round(sliderIndex.value)))
  const query = searchText.value
  const showAll = showAllTime.value
  const showHelp = useObservable(false)
  const display = useMemo(
    () => selectVisibleEntries(entries, memoryPoints, curKey === "ALL" ? null : curKey, query, idx, showAll),
    [entries, memoryPoints, curKey, query, idx, showAll],
  )
  const hasMemory = memoryPoints.length > 0
  const logRows = useMemo(
    () => display.map((entry: LogEntry) => <LogRow key={entry.line} entry={entry} showMemory={hasMemory} />),
    [display, hasMemory],
  )
  const timeRange = display.length > 0 ? `${display[0].timeString.slice(11, 19)}~${display[display.length - 1].timeString.slice(11, 19)}` : ""
  return <Section header={
    <HStack
      spacing={8}
      alignment="center"
      alert={{
        title: "日志显示说明",
        isPresented: showHelp,
        message: <Text>默认显示当前监测点与下一个监测点之间的日志，点击重置后显示全部日志</Text>,
        actions: <Button title="知道了" action={() => showHelp.setValue(false)} />,
      }}
    >
      <Text font="title3" bold>📋 日志浏览 ({entries.length} 条)</Text>
      <Button
        title="说明"
        systemImage="info.circle"
        labelStyle="iconOnly"
        action={() => showHelp.setValue(true)}
      />
    </HStack>
  }>
    <ScrollView axes="horizontal" scrollIndicator="never">
      <HStack spacing={8} padding={{ vertical: 6, horizontal: 2 }}>
        {LEVEL_FILTERS.map((item, index) => <FilterChip key={item.key} label={item.label} color={item.color} active={selectedLevel.value === index} onTap={() => selectedLevel.setValue(index)} />)}
      </HStack>
    </ScrollView>
    <TextField title="搜索" value={searchText.value} onChanged={v => searchText.setValue(v)} prompt="搜索日志内容或模块名..." />
    <HStack spacing={12} padding={{ vertical: 2 }}>
      <Text font="caption2">显示 {display.length} / {entries.length} 条</Text>
      {timeRange ? <Text font="caption2">⏱ {timeRange}</Text> : null}
      {searchText.value ? <Text font="caption2">搜索: "{searchText.value}"</Text> : null}
      {hasMemory ? <Spacer /> : null}
      {hasMemory ? <Button title={showAllTime.value ? "按时段" : "重置"} action={() => showAllTime.setValue(!showAllTime.value)} /> : null}
    </HStack>
    {display.length === 0
      ? <VStack alignment="center" padding={20}><Text font="subheadline">无匹配日志</Text></VStack>
      : logRows}
  </Section>
}

interface FilterChipProps {
  label: string
  active: boolean
  color: string
  onTap: () => void
}

function FilterChip({ label, active, color, onTap }: FilterChipProps) {
  return (
    <Text
      font="caption"
      bold
      padding={{ horizontal: 10, vertical: 5 }}
      onTapGesture={onTap}
    >
      {active ? `● ${label}` : `○ ${label}`}
    </Text>
  )
}

interface LogRowProps {
  entry: LogEntry
  showMemory: boolean
}

function LogRow({ entry, showMemory }: LogRowProps) {
  return <VStack alignment="leading" spacing={2} padding={{ horizontal: 0, vertical: 6 }} listRowSeparator="hidden">
    <HStack spacing={6}>
      <Text font="caption2" bold>[{LOG_LEVEL_CONFIG[entry.level].label}]</Text>
      <Text font="caption2">{entry.timeString.slice(11, 19)}</Text>
      {entry.module ? <Text font="caption2">{entry.module}</Text> : null}
      {showMemory && entry.memoryMB !== undefined ? <Text font="caption2" bold>{entry.memoryMB.toFixed(1)}MB</Text> : null}
    </HStack>
    <Text font="caption">{entry.message}</Text>
  </VStack>
}

interface EmptyStateProps {
  onOpenFile: () => void | Promise<void>
}

function EmptyState({ onOpenFile }: EmptyStateProps) {
  return <>
    <Section><VStack alignment="center" spacing={16} padding={40}>
      <Text font="largeTitle">📋</Text><Text font="title3">暂无日志数据</Text>
      <Text font="subheadline">点击“打开文件”，选择需要分析的 Surge 日志</Text>
    </VStack></Section>
    <HStack
      frame={{ maxWidth: "infinity" }}
      listRowBackground={<Rectangle fill="rgba(0,0,0,0)" />}
      listRowSeparator="hidden"
    >
      <Button
        buttonStyle="borderedProminent"
        buttonBorderShape={{ roundedRectangleRadius: 14 }}
        controlSize="large"
        frame={{ maxWidth: "infinity" }}
        action={onOpenFile}
      >
        <HStack frame={{ maxWidth: "infinity", minHeight: 52 }} alignment="center">
          <Spacer />
          <Text font="headline">打开文件</Text>
          <Spacer />
        </HStack>
      </Button>
    </HStack>
  </>
}

// ── 数据加载 ──

async function readFileText(path: string): Promise<string> {
  const ready = await ensureICloudFileDownloaded(path, {
    isStoredIniCloud: filePath => FileManager.isFileStoredIniCloud(filePath),
    isDownloaded: filePath => FileManager.isiCloudFileDownloaded(filePath),
    download: filePath => FileManager.downloadFileFromiCloud(filePath),
  }, APP_DIAGNOSTICS)
  if (!ready) throw new Error("iCloud file is unavailable")
  return FileManager.readAsString(path)
}

function tryReadFile(path: string): Promise<string | null> {
  return readNonEmptyTextAsync(path, readFileText, APP_DIAGNOSTICS)
}

function stopAccessingDocumentPickerResources(operation: string): void {
  try {
    DocumentPicker.stopAcessingSecurityScopedResources()
  } catch (error) {
    APP_DIAGNOSTICS.capture(`release security-scoped resources: ${operation}`, error)
  }
}

async function run() {
  try {
    await Navigation.present({ element: <App /> })
  } finally {
    Script.exit()
  }
}

run()
