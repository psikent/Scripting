import assert from "node:assert/strict"
import test from "node:test"

import {
  createDiagnosticCollector,
  ensureICloudFileDownloaded,
  readNonEmptyTextAsync,
} from "../log-files.ts"

test("async text reads reject empty content and capture failures", async () => {
  const diagnostics = createDiagnosticCollector("test")

  assert.equal(await readNonEmptyTextAsync("empty", async () => "  ", diagnostics), null)
  assert.equal(await readNonEmptyTextAsync("ok", async () => "content", diagnostics), "content")
  assert.equal(await readNonEmptyTextAsync("missing", async () => { throw new Error("denied") }, diagnostics), null)
  assert.deepEqual(diagnostics.records, [
    {
      scope: "test",
      operation: "read text: empty",
      message: "file is empty",
    },
    {
      scope: "test",
      operation: "read text: missing",
      message: "Error: denied",
    },
  ])
})

test("iCloud preparation downloads missing files and records outcomes", async () => {
  const diagnostics = createDiagnosticCollector("icloud-test")
  const calls: string[] = []
  const ready = await ensureICloudFileDownloaded("/cloud/log.txt", {
    isStoredIniCloud: path => { calls.push(`stored:${path}`); return true },
    isDownloaded: path => { calls.push(`downloaded:${path}`); return false },
    download: async path => { calls.push(`download:${path}`); return true },
  }, diagnostics)

  assert.equal(ready, true)
  assert.deepEqual(calls, [
    "stored:/cloud/log.txt",
    "downloaded:/cloud/log.txt",
    "download:/cloud/log.txt",
  ])
  assert.deepEqual(diagnostics.records.map(record => record.message), [
    "download required",
    "download completed",
  ])
})
