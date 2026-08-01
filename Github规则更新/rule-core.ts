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

function splitLeadingEditableComments(lines: string[]): { preamble: string[]; comments: string[] } {
  let commentStart = lines.length
  while (commentStart > 0 && isStandaloneComment(lines[commentStart - 1])) commentStart--
  if (commentStart === lines.length) return { preamble: lines, comments: [] }

  const hasBoundary = commentStart === 0 || lines[commentStart - 1].trim() === ''
  if (!hasBoundary) return { preamble: lines, comments: [] }
  return {
    preamble: lines.slice(0, commentStart),
    comments: lines.slice(commentStart),
  }
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
  const value = parts[1].trim()
  if (!type || !value || !/^[A-Z][A-Z0-9-]*$/.test(type)) return null

  return {
    type,
    value,
    trailing: parts.length > 2 ? `,${parts.slice(2).join(',')}` : '',
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
  const hasLeadingComment = currentRules
    .slice(0, firstRuleIndex)
    .some(rule => rule.type === RAW_TYPE && isStandaloneComment(rule.value))
  const needsBoundary = (
    hasLeadingComment &&
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

function trailingParameters(trailing: string): string[] {
  return trailing
    .split(',')
    .map(parameter => parameter.trim())
    .filter(Boolean)
}

export function applyPolicy(candidate: RuleCandidate, policy: string): RuleCandidate {
  const normalizedPolicy = policy.trim()
  if (!normalizedPolicy || normalizedPolicy.includes(',')) {
    throw new Error('策略名称不能为空且不能包含逗号')
  }

  const existingParameters = trailingParameters(candidate.trailing)
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
