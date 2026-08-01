export interface Config {
  token: string
  owner: string
  repo: string
  path: string
  branch: string
  policies: string[]
}

export interface PolicyParseResult {
  policies: string[]
  invalidPolicies: string[]
}

export interface LastRuleFileTarget {
  owner: string
  repo: string
  branch: string
  path: string
  name: string
}

export interface CommitResult {
  ok: boolean
  status: number
  error?: string
  newSha?: string
}

export function parsePolicyText(text: string): PolicyParseResult {
  const policies: string[] = []
  const invalidPolicies: string[] = []
  const seen = new Set<string>()

  for (const line of text.split(/\r?\n/)) {
    const policy = line.trim()
    if (!policy) continue
    if (policy.includes(',')) {
      invalidPolicies.push(policy)
      continue
    }
    if (!seen.has(policy)) {
      seen.add(policy)
      policies.push(policy)
    }
  }
  return { policies, invalidPolicies }
}

export function normalizeConfig(value: Partial<Config> | null): Config {
  const rawPolicies = Array.isArray(value?.policies)
    ? value.policies.filter((policy): policy is string => typeof policy === 'string')
    : []
  const parsedPolicies = parsePolicyText(rawPolicies.join('\n'))
  return {
    token: typeof value?.token === 'string' ? value.token : '',
    owner: typeof value?.owner === 'string' ? value.owner : '',
    repo: typeof value?.repo === 'string' ? value.repo : '',
    path: typeof value?.path === 'string' ? value.path : '',
    branch: typeof value?.branch === 'string' && value.branch ? value.branch : 'main',
    policies: parsedPolicies.policies,
  }
}

export function resolveInitialPolicy(policies: string[], lastPolicy: string | null): string {
  return lastPolicy && policies.includes(lastPolicy) ? lastPolicy : policies[0] ?? ''
}

export function friendlyError(status: number, fallback?: string): Error {
  if (status === 401) return new Error('鉴权失败：token 无效或已过期')
  if (status === 403) return new Error('权限不足：私有仓库需要 token 包含 repo scope')
  if (status === 404) return new Error('找不到路径或仓库（私有仓库请检查 token 权限）')
  if (status === 409) return new Error('远端已变更，请重新获取后重试')
  if (status === 422) return new Error('提交参数有误')
  return new Error(fallback ?? `请求失败 (${status})`)
}

export function targetMatchesConfig(
  config: Config,
  target: LastRuleFileTarget,
): boolean {
  return (
    target.owner.toLowerCase() === config.owner.toLowerCase() &&
    target.repo.toLowerCase() === config.repo.toLowerCase() &&
    target.branch === (config.branch || 'main')
  )
}
