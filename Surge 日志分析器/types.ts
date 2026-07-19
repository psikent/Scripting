/**
 * Surge 日志分析器 - 类型定义
 */

export type LogLevel = "INFO" | "WARN" | "ERROR" | "NOTICE" | "DEBUG" | "VERBOSE" | "UNKNOWN"

export const LOG_LEVELS: LogLevel[] = [
  "ERROR", "WARN", "NOTICE", "INFO", "DEBUG", "VERBOSE", "UNKNOWN"
]

export const LOG_LEVEL_CONFIG: Record<LogLevel, { color: string; label: string }> = {
  INFO:    { color: "#007AFF", label: "INFO" },
  WARN:    { color: "#FF9500", label: "WARN" },
  ERROR:   { color: "#FF3B30", label: "ERROR" },
  NOTICE:  { color: "#34C759", label: "NOTICE" },
  DEBUG:   { color: "#5AC8FA", label: "DEBUG" },
  VERBOSE: { color: "#AF52DE", label: "VERB" },
  UNKNOWN: { color: "#8E8E93", label: "OTHERS" },
}

export interface LogEntry {
  line: number
  timestamp: Date
  timeString: string
  level: LogLevel
  message: string
  module?: string
  memoryMB?: number
}

export interface MemoryDataPoint {
  value: number
  timestamp: Date
  rawTime: string
  sourceLine: number
}

export interface ParseResult {
  entries: LogEntry[]
  memoryPoints: MemoryDataPoint[]
  totalLines: number
  parsedAt: Date
  memoryStats: {
    min: number
    max: number
    avg: number
    latest: number
  }
}

export interface ObservableValue<T> {
  value: T
  setValue: (value: T) => void
}
