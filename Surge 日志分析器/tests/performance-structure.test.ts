import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const INDEX_SOURCE = readFileSync(new URL("../index.tsx", import.meta.url), "utf8")

test("main log UI uses native List rows, stable identities, and deferred slider commits", () => {
  assert.match(INDEX_SOURCE, /const logRows = useMemo\(/)
  assert.match(INDEX_SOURCE, /display\.map\(\(entry: LogEntry\) => <LogRow key=\{entry\.line\}/)
  assert.match(INDEX_SOURCE, /const committedSliderIndex = useObservable\(0\)/)
  assert.match(INDEX_SOURCE, /onChanged=\{value => sliderIndex\.setValue\(value\)\}/)
  assert.match(INDEX_SOURCE, /onEditingChanged=\{editing =>/)
  assert.match(INDEX_SOURCE, /committedSliderIndex\.setValue\(Math\.round\(sliderIndex\.value\)\)/)
  assert.match(INDEX_SOURCE, /const display = useMemo\(/)
  assert.match(INDEX_SOURCE, /const chartMarks = useMemo\(/)
  assert.doesNotMatch(INDEX_SOURCE, /LazyVStack/)
  assert.doesNotMatch(INDEX_SOURCE, /<LogRow key=\{i\}/)
  assert.doesNotMatch(INDEX_SOURCE, /chartXScale="date"/)
  assert.doesNotMatch(INDEX_SOURCE, /label: point\.timestamp/)
  assert.match(INDEX_SOURCE, /label: formatChartTime\(point\.timestamp\)/)
})
