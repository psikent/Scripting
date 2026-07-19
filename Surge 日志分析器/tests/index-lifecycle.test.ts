import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const INDEX_SOURCE = readFileSync(new URL("../index.tsx", import.meta.url), "utf8")

test("App starts empty and loads only a user-selected file", () => {
  assert.match(INDEX_SOURCE, /function App\(\)/)
  assert.match(INDEX_SOURCE, /useObservable<ParseResult \| null>\(null\)/)
  assert.match(INDEX_SOURCE, /useObservable<string \| null>\(null\)/)
  assert.match(INDEX_SOURCE, /const paths = await DocumentPicker\.pickFiles\(\)/)
  assert.doesNotMatch(INDEX_SOURCE, /\bIntent\./)
  assert.doesNotMatch(INDEX_SOURCE, /loadLogData/)
})

test("run presents the App and always exits in finally", () => {
  const runSource = INDEX_SOURCE.slice(INDEX_SOURCE.indexOf("async function run()"))

  assert.match(runSource, /try\s*\{[\s\S]*await Navigation\.present\(\{ element: <App \/> \}\)/)
  assert.match(runSource, /finally\s*\{\s*Script\.exit\(\)\s*\}/)

  const presentIndex = runSource.indexOf("await Navigation.present")
  const finallyIndex = runSource.indexOf("finally")
  const exitIndex = runSource.indexOf("Script.exit()")
  assert.ok(presentIndex < finallyIndex)
  assert.ok(finallyIndex < exitIndex)
})
