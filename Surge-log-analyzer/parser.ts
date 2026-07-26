/**
 * Surge 日志解析器
 *
 * Surge 日志格式:
 *   时间戳 <等级> [模块名] 消息内容
 *   例如: 2026-07-07 07:46:02.134182 <NOTIFY> [SGLog] Memory usage: 3.14MB (init)
 */

import type { LogEntry, LogLevel, MemoryDataPoint, ParseResult } from "./types"

interface SearchTextCacheEntry {
  message: string
  module: string | undefined
  messageLower: string
  moduleLower: string | undefined
}

const SEARCH_TEXT_CACHE = new WeakMap<LogEntry, SearchTextCacheEntry>()

// ── 时间戳匹配 ──
const TIMESTAMP_PATTERNS = [
  /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)/,
  /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/,
]

// ── 等级匹配 ──
const LEVEL_PATTERN = /<[ ]*(NOTIFY|WARNING|NETWORK-ERROR|NETWORK_ERROR|DEBUG|INFO|WARN(?:ING)?|ERROR|NOTICE|VERBOSE|TRACE)[ ]*>/

// ── 模块匹配 ──
const MODULE_PATTERN = /\[([^\]]+)\]\s*/

// ── 内存匹配 ──
const MEMORY_PATTERNS = [
  /[Mm]emory\s+[Uu]sage[:\s]+([\d.]+)\s*MB/i,
  /[Mm]emory[:\s]+([\d.]+)\s*MB/i,
  /(?:当前)?内存[:\s]+([\d.]+)\s*MB/i,
  /\b[Mm]em[:\s]+([\d.]+)\s*MB/i,
  /\b[Rr]eal\s*[Mm]em[:\s]+([\d.]+)\s*KB/i,
]

/**
 * 解析整段日志文本
 */
export function parseLog(logText: string): ParseResult {
  const lines = logText.split("\n")
  const entries: LogEntry[] = []
  const memoryPoints: MemoryDataPoint[] = []
  let currentYear = new Date().getFullYear()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const entry = parseLine(line, i + 1, currentYear)
    if (entry) {
      if (entry.timestamp.getFullYear() > 2000) {
        currentYear = entry.timestamp.getFullYear()
      }
      entries.push(entry)
      if (entry.memoryMB !== undefined) {
        memoryPoints.push({
          value: entry.memoryMB,
          timestamp: entry.timestamp,
          rawTime: entry.timeString,
          sourceLine: entry.line,
        })
      }
    }
  }

  memoryPoints.sort((a, b) =>
    a.timestamp.getTime() - b.timestamp.getTime() || a.sourceLine - b.sourceLine
  )
  const memValues = memoryPoints.map(p => p.value)
  let minPoint = memoryPoints[0]
  let maxPoint = memoryPoints[0]
  for (const p of memoryPoints) {
    if (p.value < minPoint.value) minPoint = p
    if (p.value > maxPoint.value) maxPoint = p
  }
  return {
    entries,
    memoryPoints,
    totalLines: lines.length,
    parsedAt: new Date(),
    memoryStats: memValues.length > 0
      ? {
          min: round(minPoint.value),
          max: round(maxPoint.value),
          avg: round(memValues.reduce((a, b) => a + b, 0) / memValues.length),
          latest: round(memValues[memValues.length - 1]),
          minTime: minPoint.timestamp,
          maxTime: maxPoint.timestamp,
        }
      : { min: 0, max: 0, avg: 0, latest: 0, minTime: new Date(0), maxTime: new Date(0) },
  }
}

/**
 * 解析单行日志
 */
function parseLine(line: string, lineNumber: number, defaultYear: number): LogEntry | null {
  let remaining = line

  // 提取时间戳
  let timeString = ""
  let timestamp: Date | null = null
  for (const pattern of TIMESTAMP_PATTERNS) {
    const match = line.match(pattern)
    if (match) {
      timeString = match[1]
      remaining = line.slice(match.index! + match[0].length).trim()
      timestamp = parseTimestamp(timeString, defaultYear)
      break
    }
  }
  if (!timestamp) return null

  // 提取等级
  let level: LogLevel = "UNKNOWN"
  const levelMatch = remaining.match(LEVEL_PATTERN)
  if (levelMatch) {
    level = normalizeLevel(levelMatch[1])
    remaining = remaining.slice(levelMatch.index! + levelMatch[0].length).trim()
  }

  // 提取模块名
  let module: string | undefined
  const moduleMatch = remaining.match(MODULE_PATTERN)
  if (moduleMatch) {
    module = moduleMatch[1]
    remaining = remaining.slice(moduleMatch.index! + moduleMatch[0].length).trim()
  }

  // 提取内存
  let memoryMB: number | undefined
  for (const pattern of MEMORY_PATTERNS) {
    const memMatch = remaining.match(pattern)
    if (memMatch) {
      const val = parseFloat(memMatch[1])
      memoryMB = /KB/i.test(memMatch[0]) ? round(val / 1024) : round(val)
      break
    }
  }

  return { line: lineNumber, timestamp, timeString, level, module, message: remaining, memoryMB }
}

// ── 辅助函数 ──

function parseTimestamp(str: string, defaultYear: number): Date | null {
  let normalized = str.trim()
  if (/^\d{2}-\d{2}\s/.test(normalized)) normalized = `${defaultYear}-${normalized}`
  if (!normalized.includes(".")) normalized += ".0"
  const date = new Date(normalized.replace(" ", "T"))
  return isNaN(date.getTime()) ? null : date
}

function normalizeLevel(level: string): LogLevel {
  const upper = level.toUpperCase()
  if (upper === "NOTIFY") return "NOTICE"
  if (upper === "WARNING") return "WARN"
  if (upper === "NETWORK-ERROR" || upper === "NETWORK_ERROR") return "ERROR"
  if (upper === "TRACE") return "VERBOSE"
  if (["INFO", "WARN", "ERROR", "NOTICE", "DEBUG", "VERBOSE"].includes(upper)) return upper as LogLevel
  return "UNKNOWN"
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

// ── 过滤与搜索 ──

export function filterByLevel(entries: LogEntry[], level: LogLevel): LogEntry[] {
  return entries.filter(e => e.level === level)
}

export function countEntriesByLevel(entries: LogEntry[]): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = {
    INFO: 0,
    WARN: 0,
    ERROR: 0,
    NOTICE: 0,
    DEBUG: 0,
    VERBOSE: 0,
    UNKNOWN: 0,
  }
  for (const entry of entries) counts[entry.level] += 1
  return counts
}

export function searchEntries(entries: LogEntry[], query: string): LogEntry[] {
  if (!query.trim()) return entries
  const q = query.toLowerCase()
  return entries.filter(entry => {
    const searchText = cachedSearchText(entry)
    return searchText.messageLower.includes(q) ||
      entry.timeString.includes(q) ||
      searchText.moduleLower?.includes(q) === true
  })
}

export function selectVisibleEntries(
  entries: LogEntry[],
  memoryPoints: MemoryDataPoint[],
  level: LogLevel | null,
  query: string,
  selectedPointIndex: number,
  showAllTime: boolean,
): { entries: LogEntry[]; startTime: string; endTime: string } {
  let filtered = entries

  // 级别筛选
  if (level) {
    filtered = filterByLevel(filtered, level)
  }

  // 搜索
  if (query.trim()) {
    filtered = searchEntries(filtered, query)
  }

  // 时间范围筛选（根据选中的数据点）
  if (!showAllTime && memoryPoints.length > 0) {
    const idx = Math.min(memoryPoints.length - 1, Math.max(0, Math.round(selectedPointIndex)))
    const selectedPoint = memoryPoints[idx]
    if (selectedPoint) {
      // 找到相邻两个数据点之间的时间范围
      let startTime: Date
      let endTime: Date
      if (idx === 0) {
        startTime = selectedPoint.timestamp
        endTime = memoryPoints.length > 1 ? new Date((selectedPoint.timestamp.getTime() + memoryPoints[1].timestamp.getTime()) / 2) : selectedPoint.timestamp
      } else if (idx === memoryPoints.length - 1) {
        startTime = new Date((memoryPoints[idx - 1].timestamp.getTime() + selectedPoint.timestamp.getTime()) / 2)
        endTime = selectedPoint.timestamp
      } else {
        startTime = new Date((memoryPoints[idx - 1].timestamp.getTime() + selectedPoint.timestamp.getTime()) / 2)
        endTime = new Date((selectedPoint.timestamp.getTime() + memoryPoints[idx + 1].timestamp.getTime()) / 2)
      }
      filtered = filtered.filter(e => e.timestamp >= startTime && e.timestamp <= endTime)
    }
  }

  const pad = (v: number) => v.toString().padStart(2, "0")
  const formatTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  
  let startTime = "--:--:--"
  let endTime = "--:--:--"
  if (filtered.length > 0) {
    const sorted = [...filtered].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.line - b.line)
    startTime = formatTime(sorted[0].timestamp)
    endTime = formatTime(sorted[sorted.length - 1].timestamp)
  }

  return { entries: filtered, startTime, endTime }
}

// ── 搜索缓存 ──

function cachedSearchText(entry: LogEntry): SearchTextCacheEntry {
  let cached = SEARCH_TEXT_CACHE.get(entry)
  if (!cached) {
    cached = {
      message: entry.message,
      module: entry.module,
      messageLower: entry.message.toLowerCase(),
      moduleLower: entry.module?.toLowerCase(),
    }
    SEARCH_TEXT_CACHE.set(entry, cached)
  }
  return cached
}