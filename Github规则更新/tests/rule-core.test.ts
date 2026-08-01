import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyPolicy,
  buildRuleCandidates,
  candidateToRule,
  createStandaloneComment,
  extractFirstAddress,
  findDuplicateRule,
  findFirstActualRuleIndex,
  insertAsFirstRule,
  insertRuleAtStart,
  insertStandaloneCommentBeforeFirstRule,
  isRejectPolicy,
  normalizeStandaloneComment,
  parseFile,
  parseRuleLine,
  serializeFile,
} from '../rule-core.ts'

test('generates the screenshot domain candidates and selects exact domain first', () => {
  const address = extractFirstAddress('gateway.icloud.com:443')
  assert.deepEqual(address, { kind: 'domain', value: 'gateway.icloud.com' })
  assert.deepEqual(
    buildRuleCandidates(address).map(candidate => `${candidate.type},${candidate.value}${candidate.trailing}`),
    [
      'DOMAIN,gateway.icloud.com',
      'DOMAIN-SUFFIX,gateway.icloud.com',
      'DOMAIN-SUFFIX,icloud.com',
      'DOMAIN-SUFFIX,com',
    ],
  )
})

test('extracts and normalizes the first URL from surrounding text', () => {
  assert.deepEqual(
    extractFirstAddress('请处理 https://Foo.Example.COM:8443/path?q=1，备用 1.2.3.4'),
    { kind: 'domain', value: 'foo.example.com' },
  )
})

test('uses the first valid address across multiple lines', () => {
  assert.deepEqual(
    extractFirstAddress('没有地址\nfirst.example.com\nsecond.example.com'),
    { kind: 'domain', value: 'first.example.com' },
  )
})

test('generates IPv4 and IPv6 host rules', () => {
  const ipv4 = buildRuleCandidates(extractFirstAddress('连接 192.0.2.10:443'))
  assert.deepEqual(ipv4, [{
    id: 'IP-CIDR,192.0.2.10/32,no-resolve',
    type: 'IP-CIDR',
    value: '192.0.2.10/32',
    trailing: ',no-resolve',
  }])

  const ipv6 = buildRuleCandidates(extractFirstAddress('https://[2001:DB8::1]:443/path'))
  assert.deepEqual(ipv6, [{
    id: 'IP-CIDR6,2001:db8::1/128,no-resolve',
    type: 'IP-CIDR6',
    value: '2001:db8::1/128',
    trailing: ',no-resolve',
  }])
})

test('adds extended-matching to DOMAIN and DOMAIN-SUFFIX rules', () => {
  const candidates = buildRuleCandidates(extractFirstAddress('www.example.com'))
  const domain = candidates[0]
  const suffix = candidates[2]

  assert.equal(
    `${applyPolicy(domain, 'Proxy').type},${applyPolicy(domain, 'Proxy').value}${applyPolicy(domain, 'Proxy').trailing}`,
    'DOMAIN,www.example.com,Proxy,extended-matching',
  )
  assert.equal(
    `${applyPolicy(suffix, 'Proxy').type},${applyPolicy(suffix, 'Proxy').value}${applyPolicy(suffix, 'Proxy').trailing}`,
    'DOMAIN-SUFFIX,example.com,Proxy,extended-matching',
  )
})

test('recognizes only the four built-in REJECT policies', () => {
  for (const policy of ['REJECT', 'REJECT-DROP', 'REJECT-NO-DROP', 'REJECT-TINYGIF']) {
    assert.equal(isRejectPolicy(policy), true)
  }
  assert.equal(isRejectPolicy('REJECT-CUSTOM'), false)
  assert.equal(isRejectPolicy('reject'), false)
})

test('adds pre-matching and extended-matching to domain REJECT rules', () => {
  const domain = buildRuleCandidates(extractFirstAddress('example.com'))[0]
  for (const policy of ['REJECT', 'REJECT-DROP', 'REJECT-NO-DROP', 'REJECT-TINYGIF']) {
    assert.equal(
      applyPolicy(domain, policy).trailing,
      `,${policy},pre-matching,extended-matching`,
    )
  }

  assert.equal(
    applyPolicy(domain, 'REJECT-CUSTOM').trailing,
    ',REJECT-CUSTOM,extended-matching',
  )
})

test('adds pre-matching before no-resolve to IP REJECT rules', () => {
  const ipv4 = buildRuleCandidates(extractFirstAddress('192.0.2.10'))[0]
  assert.equal(applyPolicy(ipv4, 'REJECT').trailing, ',REJECT,pre-matching,no-resolve')

  assert.equal(applyPolicy(ipv4, '🚀 节点选择').trailing, ',🚀 节点选择,no-resolve')

  const ipv6 = buildRuleCandidates(extractFirstAddress('[2001:db8::1]'))[0]
  assert.equal(
    applyPolicy(ipv6, 'REJECT-TINYGIF').trailing,
    ',REJECT-TINYGIF,pre-matching,no-resolve',
  )
})

test('deduplicates generated modifiers and keeps candidate IDs deterministic', () => {
  const candidate = {
    id: 'DOMAIN,example.com,extended-matching',
    type: 'DOMAIN',
    value: 'example.com',
    trailing: ',pre-matching,extended-matching,extended-matching',
  }
  const first = applyPolicy(candidate, 'REJECT')
  const second = applyPolicy(candidate, 'REJECT')

  assert.equal(first.trailing, ',REJECT,pre-matching,extended-matching')
  assert.equal(first.id, 'DOMAIN,example.com,extended-matching|policy:REJECT')
  assert.equal(second.id, first.id)
})

test('rejects empty or comma-containing policy names', () => {
  const candidate = buildRuleCandidates(extractFirstAddress('example.com'))[0]
  assert.throws(() => applyPolicy(candidate, '  '), /不能为空/)
  assert.throws(() => applyPolicy(candidate, 'Proxy,DIRECT'), /不能包含逗号/)
})

test('rejects invalid text and CIDR input', () => {
  assert.equal(extractFirstAddress('这里没有可用的地址'), null)
  assert.equal(extractFirstAddress('192.0.2.0/24'), null)
  assert.equal(extractFirstAddress('999.2.3.4'), null)
})

test('normalizes standalone comments and rejects multiline input', () => {
  assert.equal(normalizeStandaloneComment(''), '#')
  assert.equal(normalizeStandaloneComment('   '), '#')
  assert.equal(normalizeStandaloneComment('中文 🚀'), '# 中文 🚀')
  assert.equal(normalizeStandaloneComment('  # 已有前缀  '), '# 已有前缀')
  assert.throws(() => normalizeStandaloneComment('# 第一行\n第二行'), /仅支持单行/)
})

test('creates and inserts comments immediately before the first actual rule', () => {
  const parsed = parseFile('DOMAIN,one.example\nDOMAIN,two.example\n')
  const first = createStandaloneComment('# 第一条')
  const second = createStandaloneComment('第二条 🚀')
  const withFirst = insertStandaloneCommentBeforeFirstRule(parsed.rules, first)
  const withSecond = insertStandaloneCommentBeforeFirstRule(withFirst, second)

  assert.equal(findFirstActualRuleIndex(withSecond), 2)
  assert.deepEqual(withSecond.slice(0, 2).map(rule => rule.value), ['# 第一条', '# 第二条 🚀'])
  assert.equal(
    serializeFile(parsed, withSecond),
    '# 第一条\n# 第二条 🚀\nDOMAIN,one.example\nDOMAIN,two.example\n',
  )
})

test('round-trips an editable leading comment block without exposing the file header', () => {
  const original = '#!name=Custom Rule\n[Rule]\n\n# 分组一\n# 分组二 🚀\nDOMAIN,example.com,Proxy\n'
  const parsed = parseFile(original)

  assert.deepEqual(parsed.preamble, ['#!name=Custom Rule', '[Rule]', ''])
  assert.deepEqual(parsed.rules.slice(0, 2).map(rule => rule.value), ['# 分组一', '# 分组二 🚀'])
  assert.equal(parsed.rules[0].type, '__RAW__')
  assert.equal(serializeFile(parsed, parsed.rules), original)
})

test('adds a blank boundary when a new leading comment follows a nonblank preamble', () => {
  const parsed = parseFile('[Rule]\nDOMAIN,example.com\n')
  const comment = createStandaloneComment()
  const rules = insertStandaloneCommentBeforeFirstRule(parsed.rules, comment)

  assert.equal(serializeFile(parsed, rules), '[Rule]\n\n#\nDOMAIN,example.com\n')
})

test('inserts a shared rule after preamble and before existing rules', () => {
  const original = '# header\n\nDOMAIN,old.example\nDOMAIN-SUFFIX,example\n'
  const parsed = parseFile(original)
  const candidate = buildRuleCandidates(extractFirstAddress('new.example'))[0]
  const inserted = insertAsFirstRule(parsed, candidateToRule(candidate))

  assert.equal(
    serializeFile(inserted, inserted.rules),
    '# header\n\nDOMAIN,new.example\nDOMAIN,old.example\nDOMAIN-SUFFIX,example\n',
  )
})

test('inserts an Intent rule before leading standalone comments', () => {
  const original = '# header\n\n# 保留在首条规则前\nDOMAIN,old.example\n'
  const parsed = parseFile(original)
  const candidate = buildRuleCandidates(extractFirstAddress('new.example'))[0]
  const inserted = insertAsFirstRule(parsed, candidateToRule(candidate))

  assert.equal(
    serializeFile(inserted, inserted.rules),
    '# header\n\nDOMAIN,new.example\n# 保留在首条规则前\nDOMAIN,old.example\n',
  )
})

test('puts consecutive new rules at the absolute rule-region start, newest first', () => {
  const parsed = parseFile('# header\n\n# 注释区块\nDOMAIN,old.example\n')
  const first = candidateToRule(buildRuleCandidates(extractFirstAddress('first.example'))[0])
  const second = candidateToRule(buildRuleCandidates(extractFirstAddress('second.example'))[0])
  const withFirst = insertRuleAtStart(parsed.rules, first)
  const withSecond = insertRuleAtStart(withFirst, second)

  assert.equal(
    serializeFile(parsed, withSecond),
    '# header\n\nDOMAIN,second.example\nDOMAIN,first.example\n# 注释区块\nDOMAIN,old.example\n',
  )
})

test('moves a newly added comment before the current first actual rule', () => {
  const parsed = parseFile('DOMAIN,old.example\n')
  const first = candidateToRule(buildRuleCandidates(extractFirstAddress('first.example'))[0])
  const withRule = insertRuleAtStart(parsed.rules, first)
  const withComment = insertStandaloneCommentBeforeFirstRule(
    withRule,
    createStandaloneComment('# 后加注释'),
  )

  assert.equal(
    serializeFile(parsed, withComment),
    '# 后加注释\nDOMAIN,first.example\nDOMAIN,old.example\n',
  )
})

test('inserts at byte zero for a completely empty file', () => {
  const parsed = parseFile('')
  const candidate = buildRuleCandidates(extractFirstAddress('first.example'))[0]
  const inserted = insertAsFirstRule(parsed, candidateToRule(candidate))
  assert.equal(serializeFile(inserted, inserted.rules), 'DOMAIN,first.example')
})

test('finds duplicate rules by type and value and reports rule position', () => {
  const parsed = parseFile('# header\nDOMAIN,one.example\n\nDOMAIN-SUFFIX,Example.COM,Proxy\n')
  const candidate = applyPolicy(
    buildRuleCandidates(extractFirstAddress('example.com'))[1],
    'REJECT',
  )
  const match = findDuplicateRule(parsed.rules, candidate)

  assert.ok(match)
  assert.equal(match.ruleNumber, 2)
  assert.equal(match.rule.trailing, ',Proxy')
})

test('parses // inline comments but not # inline comments', () => {
  const parsed = parseRuleLine('DOMAIN,a.f-0.cc,REJECT // 磨题帮广告')
  assert.ok(parsed)
  assert.equal(parsed.type, 'DOMAIN')
  assert.equal(parsed.value, 'a.f-0.cc')
  assert.equal(parsed.trailing, ',REJECT')
  assert.equal(parsed.comment, '// 磨题帮广告')

  // 行内 # 不再识别为注释，整体留在 trailing 中
  const hash = parseRuleLine('AND,((DOMAIN-SUFFIX,xiaohongshu.com,extended-matching), (DEST-PORT,443), (PROTOCOL,UDP)),REJECT  # 小红书阻断QUIC')
  assert.ok(hash)
  assert.equal(hash.comment, '')
  assert.equal(hash.trailing, ',xiaohongshu.com,extended-matching), (DEST-PORT,443), (PROTOCOL,UDP)),REJECT  # 小红书阻断QUIC')
})

test('does not mistake // inside rule values or URLs for a comment', () => {
  const url = parseRuleLine('URL-REGEX,^https://ads\\.example\\.com/.*,Proxy')
  assert.ok(url)
  assert.equal(url.trailing, ',Proxy')
  assert.equal(url.comment, '')

  const withUrl = parseRuleLine('DOMAIN-SUFFIX,istrongcloud.com,DIRECT // Added for: https://tf02.istrongcloud.com/member/v1.2/home?r=1&tabBarHeight=89')
  assert.ok(withUrl)
  assert.equal(withUrl.trailing, ',DIRECT')
  assert.equal(withUrl.comment, '// Added for: https://tf02.istrongcloud.com/member/v1.2/home?r=1&tabBarHeight=89')
})

test('round-trips rules with // inline comments through parse and serialize', () => {
  const original = 'DOMAIN,a.f-0.cc,REJECT // 磨题帮广告\nDOMAIN-SUFFIX,ip.sb,DIRECT\n'
  const parsed = parseFile(original)
  assert.equal(parsed.rules.length, 2)
  assert.equal(parsed.rules[0].comment, '// 磨题帮广告')
  assert.equal(parsed.rules[1].comment, '')
  const serialized = serializeFile(parsed, parsed.rules)
  assert.equal(serialized.split('\n').length, 2)
  assert.ok(serialized.includes('// 磨题帮广告'))
})

test('splits logic rules (AND/OR/NOT) by parenthesis matching, not the first comma', () => {
  const and = parseRuleLine('AND,((DOMAIN-SUFFIX,xiaohongshu.com,extended-matching), (DEST-PORT,443), (PROTOCOL,UDP)),REJECT')
  assert.ok(and)
  assert.equal(and.value, '((DOMAIN-SUFFIX,xiaohongshu.com,extended-matching), (DEST-PORT,443), (PROTOCOL,UDP))')
  assert.equal(and.trailing, ',REJECT')

  const or = parseRuleLine('OR,((DOMAIN-SUFFIX,a.com),(DOMAIN-SUFFIX,b.com)),Proxy')
  assert.ok(or)
  assert.equal(or.value, '((DOMAIN-SUFFIX,a.com),(DOMAIN-SUFFIX,b.com))')
  assert.equal(or.trailing, ',Proxy')

  const not = parseRuleLine('NOT,((DOMAIN-SUFFIX,a.com)),DIRECT')
  assert.ok(not)
  assert.equal(not.value, '((DOMAIN-SUFFIX,a.com))')
  assert.equal(not.trailing, ',DIRECT')
})

test('logic rule trailing keeps params, empty when missing, and comment is preserved', () => {
  const withParams = parseRuleLine('AND,((A),(B)),DIRECT,extended-matching')
  assert.ok(withParams)
  assert.equal(withParams.trailing, ',DIRECT,extended-matching')

  const noPolicy = parseRuleLine('AND,((A),(B))')
  assert.ok(noPolicy)
  assert.equal(noPolicy.trailing, '')

  const withComment = parseRuleLine('AND,((DEST-PORT,123), (PROTOCOL,UDP)),DIRECT // 对时')
  assert.ok(withComment)
  assert.equal(withComment.value, '((DEST-PORT,123), (PROTOCOL,UDP))')
  assert.equal(withComment.trailing, ',DIRECT')
  assert.equal(withComment.comment, '// 对时')
})

test('logic rule falls back to comma splitting when parentheses are unbalanced or absent', () => {
  // (( A ) , ( B ) , REJECT——括号 3 左 2 右不匹配
  const unbalanced = parseRuleLine('AND,((A),(B),REJECT')
  assert.ok(unbalanced)
  assert.equal(unbalanced.value, '((A)')
  assert.equal(unbalanced.trailing, ',(B),REJECT')

  const noParen = parseRuleLine('AND,A,B')
  assert.ok(noParen)
  assert.equal(noParen.value, 'A')
  assert.equal(noParen.trailing, ',B')
})

test('logic rule handles deeply nested parentheses and round-trips unchanged', () => {
  const nested = parseRuleLine('AND,((((DOMAIN-SUFFIX,a.com))), (DOMAIN-SUFFIX,b.com)),REJECT')
  assert.ok(nested)
  assert.equal(nested.value, '((((DOMAIN-SUFFIX,a.com))), (DOMAIN-SUFFIX,b.com))')
  assert.equal(nested.trailing, ',REJECT')

  const original = 'AND,((DOMAIN-SUFFIX,xiaohongshu.com,extended-matching), (DEST-PORT,443), (PROTOCOL,UDP)),REJECT\n'
  const parsed = parseFile(original)
  assert.equal(serializeFile(parsed, parsed.rules), original)
})

test('non-logic rules are unaffected by parenthesis matching', () => {
  const domain = parseRuleLine('DOMAIN-SUFFIX,ip.sb,DIRECT')
  assert.ok(domain)
  assert.equal(domain.value, 'ip.sb')
  assert.equal(domain.trailing, ',DIRECT')

  const ip = parseRuleLine('IP-CIDR,1.2.3.4/32,REJECT,no-resolve')
  assert.ok(ip)
  assert.equal(ip.trailing, ',REJECT,no-resolve')
})
