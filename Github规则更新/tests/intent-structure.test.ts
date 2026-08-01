import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const intentSource = readFileSync(new URL('../intent.tsx', import.meta.url), 'utf8')
const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8')
const metadata = JSON.parse(
  readFileSync(new URL('../script.json', import.meta.url), 'utf8'),
) as { intentInputTypes: string[]; entry: string; runInApp: boolean }

test('enables only the Text share input without changing the main entry mode', () => {
  assert.deepEqual(metadata.intentInputTypes, ['Text'])
  assert.equal(metadata.entry, 'index.tsx')
  assert.equal(metadata.runInApp, false)
})

test('uses the documented text intent and presentation lifecycle', () => {
  assert.match(intentSource, /Intent\.textsParameter/)
  assert.match(intentSource, /await Navigation\.present/)
  assert.match(intentSource, /finally\s*{\s*Script\.exit\(\)/)
})

test('omits the marked mode and rule-set controls', () => {
  assert.doesNotMatch(intentSource, /创建新规则/)
  assert.doesNotMatch(intentSource, /添加到规则集/)
  assert.doesNotMatch(intentSource, /规则集/)
})

test('remembers opened files while inserting manual additions at the rule-region start', () => {
  assert.match(indexSource, /saveLastRuleFileTarget\(cfg, f\.path, f\.name\)/)
  assert.match(indexSource, /rules\.setValue\(insertRuleAtStart\(rules\.value, next\)\)/)
})

test('configures preset policies and requires a policy in the Intent', () => {
  assert.match(indexSource, /header={<Text>预置策略<\/Text>}/)
  assert.match(indexSource, /policies: parsedPolicies\.policies/)
  assert.match(intentSource, /applyPolicy\(selected, selectedPolicy\)/)
  assert.match(intentSource, /pickerStyle="navigationLink"/)
  assert.match(intentSource, /Boolean\(policyError\)/)
})

test('persists the selected policy only after a successful commit', () => {
  const successIndex = intentSource.indexOf('if (result.ok)')
  const saveIndex = intentSource.indexOf('saveLastSelectedPolicy(pending.policy)')
  assert.ok(successIndex >= 0)
  assert.ok(saveIndex > successIndex)
  assert.equal(intentSource.match(/saveLastSelectedPolicy\(/g)?.length, 1)
})

test('adds a standalone comment button and dedicated comment editor', () => {
  const addRuleIndex = indexSource.indexOf('title="+ 新增规则"')
  const addCommentIndex = indexSource.indexOf(
    '<Button title="+ 新增注释" action={startAddComment} />',
  )
  const ruleListIndex = indexSource.indexOf('{/* 规则列表 */}')

  assert.ok(addRuleIndex >= 0)
  assert.ok(addCommentIndex > addRuleIndex)
  assert.ok(ruleListIndex > addCommentIndex)
  assert.match(
    indexSource,
    /<Section>\s*<Button title="\+ 新增规则" action={startAdd} \/>\s*<Button title="\+ 新增注释" action={startAddComment} \/>\s*<\/Section>/,
  )
  assert.match(indexSource, /title="编辑注释"/)
  assert.match(indexSource, /title="删除此注释"/)
  assert.match(indexSource, /normalizeStandaloneComment\(value\.value\)/)
})

test('tracks original raw comments when deleting by row or editor', () => {
  assert.equal(indexSource.match(/if \(orig\) removed\.push\(orig\)/g)?.length, 1)
  assert.equal(
    indexSource.match(/if \(orig\) \{\s*deletedSnapshots\.setValue/g)?.length,
    1,
  )
})
