import assert from 'node:assert/strict'
import test from 'node:test'

import {
  friendlyError,
  normalizeConfig,
  parsePolicyText,
  resolveInitialPolicy,
  targetMatchesConfig,
} from '../github-core.ts'
import type { Config, LastRuleFileTarget } from '../github-core.ts'

const config: Config = {
  token: 'redacted',
  owner: 'ExampleOwner',
  repo: 'Rules',
  path: 'rules',
  branch: 'main',
  policies: ['Proxy'],
}

const target: LastRuleFileTarget = {
  owner: 'exampleowner',
  repo: 'rules',
  branch: 'main',
  path: 'rules/proxy.list',
  name: 'proxy.list',
}

test('matches remembered files only within the configured repository and branch', () => {
  assert.equal(targetMatchesConfig(config, target), true)
  assert.equal(targetMatchesConfig({ ...config, repo: 'Other' }, target), false)
  assert.equal(targetMatchesConfig({ ...config, branch: 'develop' }, target), false)
})

test('uses main as the legacy empty branch fallback', () => {
  assert.equal(targetMatchesConfig({ ...config, branch: '' }, target), true)
})

test('maps GitHub authentication, authorization, missing file, conflict and validation errors', () => {
  assert.match(friendlyError(401).message, /鉴权失败/)
  assert.match(friendlyError(403).message, /权限不足/)
  assert.match(friendlyError(404).message, /找不到路径或仓库/)
  assert.match(friendlyError(409).message, /远端已变更/)
  assert.match(friendlyError(422).message, /提交参数有误/)
  assert.equal(friendlyError(500, '服务器错误').message, '服务器错误')
})

test('migrates legacy config without policies and keeps existing GitHub fields', () => {
  const migrated = normalizeConfig({
    token: 'token', owner: 'owner', repo: 'repo', path: 'rules', branch: '',
  })
  assert.deepEqual(migrated, {
    token: 'token',
    owner: 'owner',
    repo: 'repo',
    path: 'rules',
    branch: 'main',
    policies: [],
  })
})

test('parses one policy per line, trims blanks, deduplicates exactly and rejects commas', () => {
  assert.deepEqual(
    parsePolicyText(' Proxy \n\nDIRECT\nProxy\nproxy\n🚀 节点选择\nBad,Policy '),
    {
      policies: ['Proxy', 'DIRECT', 'proxy', '🚀 节点选择'],
      invalidPolicies: ['Bad,Policy'],
    },
  )
})

test('restores the last successful policy only while it remains configured', () => {
  const policies = ['Proxy', 'DIRECT']
  assert.equal(resolveInitialPolicy(policies, 'DIRECT'), 'DIRECT')
  assert.equal(resolveInitialPolicy(policies, 'Removed'), 'Proxy')
  assert.equal(resolveInitialPolicy(policies, null), 'Proxy')
  assert.equal(resolveInitialPolicy([], 'Proxy'), '')
})
