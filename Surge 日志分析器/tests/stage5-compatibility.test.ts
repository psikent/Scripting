import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { LOG_LEVEL_CONFIG, LOG_LEVELS } from "../types.ts"

const INDEX_SOURCE = readFileSync(new URL("../index.tsx", import.meta.url), "utf8")

test("DEBUG is exposed as a first-class filter and display level", () => {
  assert.ok(LOG_LEVELS.includes("DEBUG"))
  assert.equal(LOG_LEVEL_CONFIG.DEBUG.label, "DEBUG")
  assert.ok(LOG_LEVELS.indexOf("INFO") < LOG_LEVELS.indexOf("DEBUG"))
  assert.ok(LOG_LEVELS.indexOf("DEBUG") < LOG_LEVELS.indexOf("VERBOSE"))
  assert.match(INDEX_SOURCE, /"INFO", "DEBUG", "VERBOSE"/)
})
