export type RuleStatus = 'unchanged' | 'added' | 'modified'

export const RAW_TYPE = '__RAW__'
export const ALL_TYPES = '__ALL__'

export interface Rule {
  id: string
  type: string
  value: string
  trailing: string
  comment: string
  status: RuleStatus
}

export interface ParsedFile {
  preamble: string[]
  rules: Rule[]
  trailingNewline: boolean
}

export type ExtractedAddress =
  | { kind: 'domain'; value: string }
  | { kind: 'ipv4'; value: string }
  | { kind: 'ipv6'; value: string }

export interface RuleCandidate {
  id: string
  type: string
  value: string
  trailing: string
}

export interface DuplicateRuleMatch {
  rule: Rule
  ruleNumber: number
}

const REJECT_POLICIES = new Set([
  'REJECT',
  'REJECT-DROP',
  'REJECT-NO-DROP',
  'REJECT-TINYGIF',
])

/** 规则参数选项（复选框顺序即展示顺序） */
export const RULE_PARAM_OPTIONS = ['pre-matching', 'extended-matching', 'no-resolve'] as const

let idCounter = 0

export function newId(): string {
  return `r${Date.now().toString(36)}_${++idCounter}`
}

function isCommentOrBlank(line: string): boolean {
  const value = line.trim()
  return value === '' || value.startsWith('#') || value.startsWith(';') || value.startsWith('//')
}

export function isStandaloneComment(value: string): boolean {
  return value.trimStart().startsWith('#')
}

export function normalizeStandaloneComment(value: string): string {
  if (/\r|\n/.test(value)) throw new Error('注释仅支持单行内容')
  const normalized = value.trim()
  if (!normalized) return '#'
  return normalized.startsWith('#') ? normalized : `# ${normalized}`
}

/**
 * 行内注释规范化：自动补 // 前缀；只有前缀没有内容时视为无注释。
 * 用于编辑界面预填 `// ` 后直接保存（未输入内容）不污染文件。
 */
export function normalizeInlineComment(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^\/\/\s*$/.test(trimmed)) return ''
  return trimmed.startsWith('//') ? trimmed : `// ${trimmed}`
}

function rawRule(value: string, status: RuleStatus = 'unchanged'): Rule {
  return {
    id: newId(),
    type: RAW_TYPE,
    value,
    trailing: '',
    comment: '',
    status,
  }
}

/** `#!` 开头的行属于文件元数据（如 #!name），始终留在文件头隐藏 */
function isFileHeaderMeta(line: string): boolean {
  return line.trimStart().startsWith('#!')
}

function splitLeadingEditableComments(lines: string[]): { preamble: string[]; comments: string[] } {
  // 从第一条普通注释（非 #! 元数据）开始全部作为可编辑/原样行保留，
  // 其之前的内容（如 [Rule]、#!name）留在文件头隐藏。
  const firstComment = lines.findIndex(line => isStandaloneComment(line) && !isFileHeaderMeta(line))
  if (firstComment < 0) return { preamble: lines, comments: [] }
  return {
    preamble: lines.slice(0, firstComment),
    comments: lines.slice(firstComment),
  }
}

/**
 * 逻辑规则（AND/OR/NOT）的表达式断句：从第一个 ( 做括号匹配，
 * value 为整个逻辑表达式（含两端括号），其后内容作为 trailing（策略等）。
 * 括号不匹配时返回 null，由调用方回退到普通逗号切分。
 */
function splitLogicRule(body: string): { value: string; trailing: string } | null {
  const open = body.indexOf('(')
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < body.length; i++) {
    const ch = body[i]
    if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0) {
        const value = body.slice(open, i + 1)
        const rest = body.slice(i + 1).trim()
        const trailing = rest.startsWith(',') ? rest : rest ? `,${rest}` : ''
        return { value, trailing }
      }
    }
  }
  return null
}

export function parseRuleLine(
  raw: string,
): { type: string; value: string; trailing: string; comment: string } | null {
  let body = raw
  let comment = ''

  // 行内注释仅识别 //（// 前必须是行首或空白，避免误伤 https:// 等）
  const slashMatch = raw.match(/(?:^|\s)\/\//)
  if (slashMatch) {
    const slashIndex = slashMatch.index! + (slashMatch[0].startsWith('//') ? 0 : 1)
    body = raw.slice(0, slashIndex).trimEnd()
    comment = raw.slice(slashIndex)
  }

  const parts = body.split(',')
  if (parts.length < 2) return null

  const type = parts[0].trim()
  if (!type || !/^[A-Z][A-Z0-9-]*$/.test(type)) return null

  // 逻辑规则：从第一个 ( 做括号匹配，value 为完整表达式，trailing 仅含策略/参数
  let value = parts[1].trim()
  let trailing = parts.length > 2 ? `,${parts.slice(2).join(',')}` : ''
  if (type === 'AND' || type === 'OR' || type === 'NOT') {
    const logic = splitLogicRule(body)
    if (logic) {
      value = logic.value
      trailing = logic.trailing
    }
  }
  if (!value) return null

  return {
    type,
    value,
    trailing,
    comment,
  }
}

export function parseFile(content: string): ParsedFile {
  if (content === '') return { preamble: [], rules: [], trailingNewline: false }
  const trailingNewline = content.endsWith('\n')
  const lines = content.split('\n')
  if (trailingNewline) lines.pop()

  const firstRuleIndex = lines.findIndex(line => parseRuleLine(line) !== null)
  const leadingEnd = firstRuleIndex < 0 ? lines.length : firstRuleIndex
  const leading = splitLeadingEditableComments(lines.slice(0, leadingEnd))
  const preamble = leading.preamble
  const rules: Rule[] = []
  rules.push(...leading.comments.map(line => rawRule(line)))

  if (firstRuleIndex < 0) {
    return { preamble, rules, trailingNewline }
  }

  for (const line of lines.slice(firstRuleIndex)) {
    const parsed = isCommentOrBlank(line) ? null : parseRuleLine(line)
    if (parsed) {
      rules.push({ id: newId(), ...parsed, status: 'unchanged' })
    } else {
      rules.push(rawRule(line))
    }
  }

  return { preamble, rules, trailingNewline }
}

export function formatRule(rule: Rule | RuleCandidate): string {
  if ('comment' in rule && rule.type === RAW_TYPE) return rule.value
  const comment = 'comment' in rule && rule.comment ? `  ${rule.comment.trim()}` : ''
  return `${rule.type},${rule.value}${rule.trailing}${comment}`
}

export function serializeFile(file: ParsedFile, currentRules: Rule[]): string {
  const firstRuleIndex = findFirstActualRuleIndex(currentRules)
  // 仅在「本次新增」了前置注释时补空行分隔；文件原有的首部注释原样保留顺序
  const hasNewLeadingComment = currentRules
    .slice(0, firstRuleIndex)
    .some(rule => rule.type === RAW_TYPE && rule.status === 'added' && isStandaloneComment(rule.value))
  const needsBoundary = (
    hasNewLeadingComment &&
    file.preamble.length > 0 &&
    file.preamble[file.preamble.length - 1].trim() !== ''
  )
  const preamble = needsBoundary ? [...file.preamble, ''] : file.preamble
  const output = [...preamble, ...currentRules.map(formatRule)]
  return output.join('\n') + (file.trailingNewline ? '\n' : '')
}

export function findFirstActualRuleIndex(rules: Rule[]): number {
  const index = rules.findIndex(rule => rule.type !== RAW_TYPE)
  return index < 0 ? rules.length : index
}

export function createStandaloneComment(value = '#'): Rule {
  return rawRule(normalizeStandaloneComment(value), 'added')
}

export function insertStandaloneCommentBeforeFirstRule(rules: Rule[], comment: Rule): Rule[] {
  const index = findFirstActualRuleIndex(rules)
  return [...rules.slice(0, index), comment, ...rules.slice(index)]
}

export function insertRuleAtStart(rules: Rule[], rule: Rule): Rule[] {
  return [rule, ...rules]
}

function isValidIPv4(value: string): boolean {
  const parts = value.split('.')
  return parts.length === 4 && parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) return false
    if (part.length > 1 && part.startsWith('0')) return false
    const number = Number(part)
    return number >= 0 && number <= 255
  })
}

function isValidIPv6(value: string): boolean {
  if (!value || value.includes(':::') || value.indexOf('::') !== value.lastIndexOf('::')) return false

  let candidate = value
  let ipv4SegmentCount = 0
  const lastColon = candidate.lastIndexOf(':')
  const possibleIPv4 = lastColon >= 0 ? candidate.slice(lastColon + 1) : ''
  if (possibleIPv4.includes('.')) {
    if (!isValidIPv4(possibleIPv4)) return false
    candidate = `${candidate.slice(0, lastColon)}:v4`
    ipv4SegmentCount = 2
  }

  const compressed = candidate.includes('::')
  const segments = candidate.split(':').filter(Boolean)
  let segmentCount = ipv4SegmentCount
  for (const segment of segments) {
    if (segment === 'v4') continue
    if (!/^[0-9a-f]{1,4}$/i.test(segment)) return false
    segmentCount++
  }
  return compressed ? segmentCount < 8 : segmentCount === 8
}

function isValidDomain(value: string): boolean {
  if (value.length > 253 || !value.includes('.')) return false
  const labels = value.split('.')
  return labels.every(label => (
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9-]+$/i.test(label) &&
    !label.startsWith('-') &&
    !label.endsWith('-')
  ))
}

function stripTerminalPunctuation(value: string): string {
  return value
    .replace(/^[\s('"“‘<]+/, '')
    .replace(/[\s),.;!?，。；！？、'"”’>]+$/, '')
}

function normalizeHost(value: string): ExtractedAddress | null {
  let host = stripTerminalPunctuation(value.trim())
  if (!host) return null

  if (/^https?:\/\//i.test(host)) {
    const authority = host.slice(host.indexOf('://') + 3).split(/[/?#]/, 1)[0]
    host = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority
    if (!host) return null
  }

  if (host.startsWith('[')) {
    const closing = host.indexOf(']')
    if (closing < 0) return null
    const rest = host.slice(closing + 1)
    if (rest && !/^:\d{1,5}$/.test(rest)) return null
    host = host.slice(1, closing)
  } else {
    const portMatch = host.match(/^(.+):(\d{1,5})$/) 
    if (portMatch && !portMatch[1].includes(':')) host = portMatch[1]
  }

  host = host.replace(/\.$/, '').toLowerCase()
  if (isValidIPv4(host)) return { kind: 'ipv4', value: host }
  if (/^\d+(?:\.\d+){3}$/.test(host)) return null
  if (isValidIPv6(host)) return { kind: 'ipv6', value: host }
  if (isValidDomain(host)) return { kind: 'domain', value: host }
  return null
}

/** 从任意分享文字中，按出现顺序提取第一个 URL、域名或 IP。 */
export function extractFirstAddress(text: string): ExtractedAddress | null {
  const pattern = /https?:\/\/[^\s<>"']+|\[[0-9a-f:.]+\](?::\d{1,5})?|(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?|(?:[a-z0-9-]+\.)+[a-z0-9-]+(?::\d{1,5})?|[0-9a-f]*:[0-9a-f:]+/gi
  for (const match of text.matchAll(pattern)) {
    const end = (match.index ?? 0) + match[0].length
    if (/^\/\d/.test(text.slice(end))) continue
    const address = normalizeHost(match[0])
    if (address) return address
  }
  return normalizeHost(text)
}

export function buildRuleCandidates(address: ExtractedAddress | null): RuleCandidate[] {
  if (!address) return []
  if (address.kind === 'ipv4') {
    return [{
      id: `IP-CIDR,${address.value}/32,no-resolve`,
      type: 'IP-CIDR',
      value: `${address.value}/32`,
      trailing: ',no-resolve',
    }]
  }
  if (address.kind === 'ipv6') {
    return [{
      id: `IP-CIDR6,${address.value}/128,no-resolve`,
      type: 'IP-CIDR6',
      value: `${address.value}/128`,
      trailing: ',no-resolve',
    }]
  }

  const candidates: RuleCandidate[] = [{
    id: `DOMAIN,${address.value}`,
    type: 'DOMAIN',
    value: address.value,
    trailing: '',
  }]
  const labels = address.value.split('.')
  for (let index = 0; index < labels.length; index++) {
    const value = labels.slice(index).join('.')
    candidates.push({
      id: `DOMAIN-SUFFIX,${value}`,
      type: 'DOMAIN-SUFFIX',
      value,
      trailing: '',
    })
  }
  return candidates
}

export function isRejectPolicy(policy: string): boolean {
  return REJECT_POLICIES.has(policy.trim())
}

/** 参数名是否属于「策略」：预置策略或内置 REJECT 系列 */
function isPolicyName(parameter: string, knownPolicies: string[]): boolean {
  return knownPolicies.includes(parameter) || isRejectPolicy(parameter)
}

/** 把 trailing 按逗号拆成参数数组（去空白、去空项） */
export function trailingParams(trailing: string): string[] {
  return trailing
    .split(',')
    .map(parameter => parameter.trim())
    .filter(Boolean)
}

/** 取 trailing 中的策略名：首个参数只要不是规则参数选项即视为策略（支持手输策略） */
export function firstPolicyOf(trailing: string): string {
  const params = trailingParams(trailing)
  if (params.length === 0) return ''
  return RULE_PARAM_OPTIONS.includes(params[0] as any) ? '' : params[0]
}

/**
 * 规则参数默认集：
 * - REJECT 系列策略 → pre-matching
 * - DOMAIN 系列类型 → extended-matching
 * - IP-CIDR 系列类型 → no-resolve
 */
export function defaultRuleParams(type: string, policy: string): string[] {
  const params: string[] = []
  if (isRejectPolicy(policy)) params.push('pre-matching')
  if (/^DOMAIN/.test(type)) params.push('extended-matching')
  else if (/^IP-CIDR/.test(type)) params.push('no-resolve')
  return params
}

/** 用策略 + 参数列表拼出 trailing；全部为空时返回 ''（不带逗号） */
export function composeTrailing(policy: string, params: string[]): string {
  const items = [...(policy && policy.trim() ? [policy.trim()] : []), ...params]
  return items.length > 0 ? `,${items.join(',')}` : ''
}

/** 勾选/取消某个规则参数（不影响策略名及其他参数） */
export function setTrailingParam(trailing: string, param: string, enabled: boolean): string {
  const params = trailingParams(trailing)
  const index = params.indexOf(param)
  if (enabled) {
    if (index < 0) params.push(param)
  } else if (index >= 0) {
    params.splice(index, 1)
  }
  return params.length > 0 ? `,${params.join(',')}` : ''
}

/**
 * 从 trailing（如 `,Proxy,no-resolve`）中解析当前策略：
 * 取第一个参数，仅当它出现在 knownPolicies（预置策略）中才视为策略，否则返回 ''。
 * （REJECT 等内置策略不在预置列表时也返回 ''，Picker 显示「无」。）
 */
export function parseTrailingPolicy(trailing: string, knownPolicies: string[]): string {
  const first = trailingParams(trailing)[0] ?? ''
  return knownPolicies.includes(first) ? first : ''
}

/**
 * 设置/清除 trailing 中的策略名，保留其余参数（如 no-resolve）。
 * policy 为空表示选择「无」：移除策略；若移除后无任何参数则返回 ''（不带逗号）。
 * 策略识别：首个参数不是规则参数选项（pre-matching 等）即视为策略。
 */
export function setTrailingPolicy(trailing: string, policy: string, knownPolicies: string[]): string {
  const params = trailingParams(trailing)
  if (!policy) {
    const rest = params.length > 0 && (RULE_PARAM_OPTIONS as readonly string[]).includes(params[0])
      ? params
      : params.slice(1)
    return rest.length > 0 ? `,${rest.join(',')}` : ''
  }
  const current = params[0] && isPolicyName(params[0], knownPolicies) ? params[0] : null
  if (current) {
    params[0] = policy
  } else {
    params.unshift(policy)
  }
  return `,${params.join(',')}`
}

export function applyPolicy(candidate: RuleCandidate, policy: string): RuleCandidate {
  const normalizedPolicy = policy.trim()
  if (!normalizedPolicy || normalizedPolicy.includes(',')) {
    throw new Error('策略名称不能为空且不能包含逗号')
  }

  const existingParameters = trailingParams(candidate.trailing)
  const parameters: string[] = [normalizedPolicy]
  const seen = new Set(parameters)
  const appendUnique = (parameter: string) => {
    if (seen.has(parameter)) return
    seen.add(parameter)
    parameters.push(parameter)
  }

  if (isRejectPolicy(normalizedPolicy)) appendUnique('pre-matching')

  for (const parameter of existingParameters) {
    const normalizedParameter = parameter.toLowerCase()
    if (
      parameter === normalizedPolicy ||
      normalizedParameter === 'pre-matching' ||
      normalizedParameter === 'extended-matching'
    ) {
      continue
    }
    appendUnique(parameter)
  }

  if (candidate.type === 'DOMAIN' || candidate.type === 'DOMAIN-SUFFIX') {
    appendUnique('extended-matching')
  }

  return {
    ...candidate,
    id: `${candidate.id}|policy:${normalizedPolicy}`,
    trailing: `,${parameters.join(',')}`,
  }
}

export function candidateToRule(candidate: RuleCandidate): Rule {
  return {
    id: newId(),
    type: candidate.type,
    value: candidate.value,
    trailing: candidate.trailing,
    comment: '',
    status: 'added',
  }
}

export function insertAsFirstRule(file: ParsedFile, rule: Rule): ParsedFile {
  return {
    ...file,
    rules: insertRuleAtStart(file.rules, rule),
  }
}

export function findDuplicateRule(
  rules: Rule[],
  candidate: RuleCandidate,
): DuplicateRuleMatch | null {
  let ruleNumber = 0
  for (const rule of rules) {
    if (rule.type === RAW_TYPE) continue
    ruleNumber++
    if (
      rule.type.toUpperCase() === candidate.type.toUpperCase() &&
      rule.value.toLowerCase() === candidate.value.toLowerCase()
    ) {
      return { rule, ruleNumber }
    }
  }
  return null
}
