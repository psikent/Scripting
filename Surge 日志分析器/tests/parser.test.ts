import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { countEntriesByLevel, filterByLevel, parseLog, searchEntries, selectVisibleEntries } from "../parser.ts"
import type { LogEntry, LogLevel, MemoryDataPoint } from "../types.ts"

const SMALL_FIXTURE = new URL("./fixtures/small.log", import.meta.url)
const LARGE_FIXTURE = new URL("../_cache_log.txt", import.meta.url)

function readFixture(url: URL): string {
  return readFileSync(url, "utf8")
}

test("parseLog preserves the small fixed-sample behavior", () => {
  const result = parseLog(readFixture(SMALL_FIXTURE))

  assert.equal(result.totalLines, 8)
  assert.equal(result.entries.length, 6)
  assert.deepEqual(countEntriesByLevel(result.entries), {
    INFO: 1,
    WARN: 1,
    ERROR: 1,
    NOTICE: 1,
    DEBUG: 1,
    VERBOSE: 0,
    UNKNOWN: 1,
  })

  assert.deepEqual(result.memoryPoints.map(point => point.value), [3.14, 2])
  assert.deepEqual(result.memoryStats, {
    min: 2,
    max: 3.14,
    avg: 2.57,
    latest: 2,
  })

  assert.equal(result.entries[0].module, "SGLog")
  assert.equal(result.entries[1].module, "MemoryMonitor")
  assert.equal(result.entries[2].level, "DEBUG")
  assert.equal(result.entries[3].module, "Mystery")
  assert.equal(result.entries[3].message, "Unclassified Payload")
  assert.equal(result.entries[5].module, undefined)
  assert.equal(result.entries[5].message, "Search Needle without module")
})

test("memory points use chronological order and invalid timestamps are ignored", () => {
  const result = parseLog([
    "2026-07-19 00:01:00.000000 <NOTICE> [SGLog] Memory usage: 30MB",
    "2026-07-18 23:59:00.000000 <NOTICE> [SGLog] Memory usage: 20MB",
    "2026-99-99 25:61:61.000000 <NOTICE> [SGLog] Memory usage: 99MB",
  ].join("\n"))

  assert.deepEqual(result.memoryPoints.map(point => point.value), [20, 30])
  assert.deepEqual(result.memoryPoints.map(point => point.sourceLine), [2, 1])
  assert.equal(result.memoryStats.latest, 30)
})

test("duplicate memory timestamps share the next strictly later log window", () => {
  const result = parseLog([
    "2026-07-18 20:40:00.000000 <NOTICE> [SGLog] Memory usage: 20MB",
    "2026-07-18 20:40:00.000000 <NOTICE> [SGLog] Memory usage: 21MB",
    "2026-07-18 20:40:30.000000 <INFO> [Core] Same window",
    "2026-07-18 21:00:00.000000 <NOTICE> [SGLog] Memory usage: 22MB",
  ].join("\n"))

  assert.deepEqual(
    selectVisibleEntries(result.entries, result.memoryPoints, null, "", 0, false).map(entry => entry.line),
    [1, 2, 3],
  )
  assert.deepEqual(
    selectVisibleEntries(result.entries, result.memoryPoints, null, "", 1, false).map(entry => entry.line),
    [1, 2, 3],
  )
})

test("filterByLevel preserves matching entry order and identity", () => {
  const entries = parseLog(readFixture(SMALL_FIXTURE)).entries
  const unknownEntries = filterByLevel(entries, "UNKNOWN")

  assert.deepEqual(unknownEntries.map(entry => entry.line), [4])
  assert.strictEqual(unknownEntries[0], entries[3])
  assert.deepEqual(filterByLevel(entries, "DEBUG").map(entry => entry.line), [3])
  assert.deepEqual(filterByLevel(entries, "VERBOSE"), [])
})

test("searchEntries covers message, module, timestamp, case, and blank queries", () => {
  const entries = parseLog(readFixture(SMALL_FIXTURE)).entries

  assert.deepEqual(searchEntries(entries, "needle").map(entry => entry.line), [7])
  assert.deepEqual(searchEntries(entries, "COREENGINE").map(entry => entry.line), [3])
  assert.deepEqual(searchEntries(entries, "15:33:50.700000").map(entry => entry.line), [7])
  assert.deepEqual(searchEntries(entries, "payload").map(entry => entry.line), [4])
  assert.deepEqual(searchEntries(entries, "not present"), [])
  assert.strictEqual(searchEntries(entries, "   "), entries)

  // Cache validation keeps behavior correct if a caller updates an entry in place.
  entries[0].message = "Changed Search Value"
  assert.deepEqual(searchEntries(entries, "changed search").map(entry => entry.line), [1])
})

test("selectVisibleEntries preserves level, search, and memory-window composition", () => {
  const result = parseLog(readFixture(SMALL_FIXTURE))

  assert.deepEqual(
    selectVisibleEntries(result.entries, result.memoryPoints, null, "", 0, false).map(entry => entry.line),
    [1],
  )
  assert.deepEqual(
    selectVisibleEntries(result.entries, result.memoryPoints, null, "", 1, false).map(entry => entry.line),
    [2, 3, 4, 6, 7],
  )
  assert.deepEqual(
    selectVisibleEntries(result.entries, result.memoryPoints, "ERROR", "FAILED", 0, true).map(entry => entry.line),
    [6],
  )
  assert.equal(selectVisibleEntries(result.entries, result.memoryPoints, "VERBOSE", "", 0, true).length, 0)
})

test("optimized selection matches the previous algorithm across the large sample", () => {
  const result = parseLog(readFixture(LARGE_FIXTURE))
  const levels: Array<LogLevel | null> = [null, "ERROR", "WARN", "NOTICE", "DEBUG", "UNKNOWN"]
  const queries = ["", "packet", "SGLOG", "203.119"]
  const pointIndices = [-1, 0, 3, 7, 99]

  for (const level of levels) {
    for (const query of queries) {
      for (const pointIndex of pointIndices) {
        for (const showAllTime of [false, true]) {
          const actual = selectVisibleEntries(
            result.entries,
            result.memoryPoints,
            level,
            query,
            pointIndex,
            showAllTime,
          )
          const expected = previousSelection(
            result.entries,
            result.memoryPoints,
            level,
            query,
            pointIndex,
            showAllTime,
          )
          assert.deepEqual(actual.map(entry => entry.line), expected.map(entry => entry.line))
        }
      }
    }
  }
})

test("parseLog reproduces the current large-sample baseline", () => {
  const result = parseLog(readFixture(LARGE_FIXTURE))

  // parsedAt is intentionally excluded because it is generated at runtime.
  assert.equal(result.totalLines, 1987)
  assert.equal(result.entries.length, 1986)
  assert.deepEqual(countEntriesByLevel(result.entries), {
    INFO: 0,
    WARN: 687,
    ERROR: 808,
    NOTICE: 491,
    DEBUG: 0,
    VERBOSE: 0,
    UNKNOWN: 0,
  })
  assert.equal(result.memoryPoints.length, 8)
  assert.deepEqual(result.memoryStats, {
    min: 3.27,
    max: 23.64,
    avg: 17.02,
    latest: 23.64,
  })
  assert.equal(result.entries[0].timeString, "2026-07-11 15:33:44.177898")
  assert.equal(result.entries.at(-1)?.timeString, "2026-07-11 23:21:09.819320")
})

function previousSelection(
  entries: LogEntry[],
  memoryPoints: MemoryDataPoint[],
  level: LogLevel | null,
  query: string,
  pointIndex: number,
  showAllTime: boolean,
): LogEntry[] {
  let filtered = level ? entries.filter(entry => entry.level === level) : entries
  if (query.trim()) {
    const lowerQuery = query.toLowerCase()
    filtered = filtered.filter(entry =>
      entry.message.toLowerCase().includes(lowerQuery) ||
      entry.timeString.includes(lowerQuery) ||
      (entry.module && entry.module.toLowerCase().includes(lowerQuery))
    )
  }
  if (memoryPoints.length > 0 && !showAllTime) {
    const index = Math.min(memoryPoints.length - 1, Math.max(0, Math.round(pointIndex)))
    const fromMs = memoryPoints[index].timestamp.getTime()
    let nextIndex = index + 1
    while (nextIndex < memoryPoints.length && memoryPoints[nextIndex].timestamp.getTime() <= fromMs) {
      nextIndex += 1
    }
    const from = memoryPoints[index].timestamp
    const to = nextIndex < memoryPoints.length
      ? memoryPoints[nextIndex].timestamp
      : new Date(8640000000000000)
    filtered = filtered.filter(entry => entry.timestamp >= from && entry.timestamp < to)
  }
  return filtered
}
