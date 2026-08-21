import { fetch } from 'scripting'

import {
  friendlyError,
  normalizeConfig,
  resolveInitialPolicy,
  targetMatchesConfig,
} from './github-core'
import type {
  CommitResult,
  Config,
  LastRuleFileTarget,
} from './github-core'

export {
  friendlyError,
} from './github-core'
export type {
  CommitResult,
  Config,
  LastRuleFileTarget,
} from './github-core'

declare const Storage: {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): boolean
}

declare const Data: {
  fromBase64String(base64: string): { toRawString(): string | null } | null
  fromRawString(str: string, encoding: string): { toBase64String(): string } | null
}

const CONFIG_KEY = 'github_config'
const LAST_RULE_FILE_TARGET_KEY = 'github_last_rule_file_target_v1'
const LAST_SELECTED_POLICY_KEY = 'github_last_selected_policy_v1'
const REQUEST_TIMEOUT_SECONDS = 20
type ScriptingResponse = Awaited<ReturnType<typeof fetch>>

export function encodeURIPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export async function ghGet(url: string, token: string): Promise<ScriptingResponse> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    timeout: REQUEST_TIMEOUT_SECONDS,
  })
}

export async function fetchFileContent(
  config: Config,
  path: string,
): Promise<{ content: string; sha: string }> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIPath(path)}?ref=${encodeURIComponent(config.branch || 'main')}`
  const response = await ghGet(url, config.token)
  if (!response.ok) throw friendlyError(response.status)
  const body = await response.json()
  if (!body.content) throw new Error(body.message || '读取文件失败')
  const decoded = Data.fromBase64String(body.content.replace(/\n/g, ''))
  return { content: decoded?.toRawString() ?? '', sha: body.sha }
}

export async function commitFileContent(
  config: Config,
  path: string,
  content: string,
  sha: string,
  message: string,
): Promise<CommitResult> {
  const data = Data.fromRawString(content, 'utf-8')
  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIPath(path)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        content: data?.toBase64String() ?? '',
        sha,
        branch: config.branch || 'main',
      }),
      timeout: REQUEST_TIMEOUT_SECONDS,
    },
  )

  if (response.ok) {
    const body = await response.json()
    return { ok: true, status: response.status, newSha: body.content?.sha }
  }
  const errorBody = await response.json().catch(() => ({}))
  return {
    ok: false,
    status: response.status,
    error: response.status === 409
      ? friendlyError(409).message
      : errorBody.message ?? friendlyError(response.status).message,
  }
}

export function getConfig(): Config {
  return normalizeConfig(Storage.get<Partial<Config>>(CONFIG_KEY))
}

export function saveConfig(config: Config): void {
  Storage.set(CONFIG_KEY, config)
}

export function saveLastRuleFileTarget(
  config: Config,
  path: string,
  name: string,
): void {
  Storage.set<LastRuleFileTarget>(LAST_RULE_FILE_TARGET_KEY, {
    owner: config.owner,
    repo: config.repo,
    branch: config.branch || 'main',
    path,
    name,
  })
}

export function getLastRuleFileTarget(config: Config): LastRuleFileTarget | null {
  const target = Storage.get<LastRuleFileTarget>(LAST_RULE_FILE_TARGET_KEY)
  if (!target) return null
  return targetMatchesConfig(config, target) ? target : null
}

export function getLastSelectedPolicy(policies: string[]): string {
  return resolveInitialPolicy(policies, Storage.get<string>(LAST_SELECTED_POLICY_KEY))
}

export function saveLastSelectedPolicy(policy: string): void {
  Storage.set(LAST_SELECTED_POLICY_KEY, policy)
}
