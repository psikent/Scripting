import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const INDEX_SOURCE = readFileSync(new URL("../index.tsx", import.meta.url), "utf8")

test("runtime file content operations use asynchronous APIs", () => {
  const syncIoPattern = /FileManager\.(?:readAsString|readDirectory|copyFile|writeAsString|exists|isDirectory)Sync\b/

  assert.doesNotMatch(INDEX_SOURCE, syncIoPattern)
  assert.match(INDEX_SOURCE, /return FileManager\.readAsString\(path\)/)
})

test("document picker resources are released in finally", () => {
  assert.match(INDEX_SOURCE, /finally\s*\{[\s\S]*stopAccessingDocumentPickerResources\("open selected file"\)/)
  assert.match(INDEX_SOURCE, /DocumentPicker\.stopAcessingSecurityScopedResources\(\)/)
})
