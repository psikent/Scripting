/**
 * Surge 日志文件读取的公共基础逻辑。
 *
 * 本模块不在导入时访问 Scripting 宿主 API，文件系统能力由调用方注入，
 * 因而错误处理与 iCloud 准备逻辑可在本地 Node.js 中回归测试。
 */

const MAX_DIAGNOSTIC_RECORDS = 100

export type AsyncTextReader = (path: string) => Promise<string>

export interface DiagnosticRecord {
  scope: string
  operation: string
  message: string
}

export interface DiagnosticCollector {
  readonly records: readonly DiagnosticRecord[]
  note: (operation: string, message: string) => void
  capture: (operation: string, error: unknown) => void
}

export interface ICloudFileAdapters {
  isStoredIniCloud: (path: string) => boolean
  isDownloaded: (path: string) => boolean
  download: (path: string) => Promise<boolean>
}

export function createDiagnosticCollector(scope: string): DiagnosticCollector {
  const records: DiagnosticRecord[] = []
  return {
    get records() { return records },
    note(operation, message) {
      appendDiagnostic(records, { scope, operation, message })
    },
    capture(operation, error) {
      appendDiagnostic(records, { scope, operation, message: String(error) })
    },
  }
}

export async function readNonEmptyTextAsync(
  path: string,
  readText: AsyncTextReader,
  diagnostics?: DiagnosticCollector,
): Promise<string | null> {
  try {
    const content = await readText(path)
    if (!content || !content.trim()) {
      diagnostics?.note(`read text: ${path}`, "file is empty")
      return null
    }
    return content
  } catch (error) {
    diagnostics?.capture(`read text: ${path}`, error)
    return null
  }
}

export async function ensureICloudFileDownloaded(
  path: string,
  adapters: ICloudFileAdapters,
  diagnostics?: DiagnosticCollector,
): Promise<boolean> {
  let storedIniCloud = false
  try {
    storedIniCloud = adapters.isStoredIniCloud(path)
  } catch (error) {
    // Some security-scoped providers cannot answer this query; preserve the read attempt.
    diagnostics?.capture(`check iCloud storage: ${path}`, error)
    return true
  }
  if (!storedIniCloud) return true

  try {
    if (adapters.isDownloaded(path)) return true
  } catch (error) {
    diagnostics?.capture(`check iCloud download: ${path}`, error)
    return true
  }

  diagnostics?.note(`download iCloud file: ${path}`, "download required")
  try {
    const downloaded = await adapters.download(path)
    diagnostics?.note(
      `download iCloud file: ${path}`,
      downloaded ? "download completed" : "download failed",
    )
    return downloaded
  } catch (error) {
    diagnostics?.capture(`download iCloud file: ${path}`, error)
    return false
  }
}

function appendDiagnostic(records: DiagnosticRecord[], record: DiagnosticRecord): void {
  if (records.length >= MAX_DIAGNOSTIC_RECORDS) records.shift()
  records.push(record)
}
