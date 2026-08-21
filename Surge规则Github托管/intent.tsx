import {
  Button,
  Intent,
  List,
  Navigation,
  NavigationStack,
  Picker,
  Script,
  Section,
  Text,
  TextField,
  VStack,
  useEffect,
  useMemo,
  useState,
} from 'scripting'

import {
  INLINE_COMMENT_NEWLINES,
  Rule,
  RuleCandidate,
  applyPolicy,
  buildRuleCandidates,
  candidateToRule,
  extractFirstAddress,
  findDuplicateRule,
  formatRule,
  insertAsFirstRule,
  parseFile,
  serializeFile,
} from './rule-core'
import { withBuiltInPolicies } from './github-core'
import {
  Config,
  LastRuleFileTarget,
  commitFileContent,
  fetchFileContent,
  getConfig,
  getLastRuleFileTarget,
  getLastSelectedPolicy,
  saveLastSelectedPolicy,
} from './github-rules'

interface PendingCommit {
  config: Config
  target: LastRuleFileTarget
  candidate: Rule
  policy: string
  content: string
  sha: string
}

type IntentPhase = 'edit' | 'confirm' | 'success'

function CandidateLabel({ candidate }: { candidate: RuleCandidate }) {
  return (
    <VStack tag={candidate.id} alignment="leading" spacing={2}>
      <Text bold>{candidate.type}</Text>
      <Text font="caption" foregroundStyle="secondaryLabel">
        {candidate.value}{candidate.trailing}
      </Text>
    </VStack>
  )
}

function IntentApp({ initialText }: { initialText: string }) {
  const dismiss = Navigation.useDismiss()
  const config = getConfig()
  const policies = withBuiltInPolicies(config.policies)
  const [phase, setPhase] = useState<IntentPhase>('edit')
  const [input, setInput] = useState(initialText)
  const [selectedId, setSelectedId] = useState('')
  const [selectedPolicy, setSelectedPolicy] = useState(() => getLastSelectedPolicy(policies))
  const [pending, setPending] = useState<PendingCommit | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [inlineComment, setInlineComment] = useState('')

  const address = useMemo(() => extractFirstAddress(input), [input])
  const candidates = useMemo(() => buildRuleCandidates(address), [address])
  const selected = useMemo(
    () => candidates.find(candidate => candidate.id === selectedId) ?? candidates[0] ?? null,
    [candidates, selectedId],
  )
  const selectedWithPolicy = useMemo(
    () => selected && selectedPolicy ? applyPolicy(selected, selectedPolicy) : null,
    [selected, selectedPolicy],
  )

  useEffect(() => {
    if (!candidates.some(candidate => candidate.id === selectedId)) {
      setSelectedId(candidates[0]?.id ?? '')
    }
  }, [candidates, selectedId])

  const target = getLastRuleFileTarget(config)
  const missingConfig = !config.token || !config.owner || !config.repo
  const targetError = missingConfig
    ? '请先在主界面完成 GitHub 配置，并打开一次目标规则文件。'
    : !target
      ? '尚未找到当前仓库最近打开的规则文件，请先在主界面打开目标文件。'
      : ''
  const policyError = policies.length === 0
    ? '请先在主界面设置中配置至少一个预置策略。'
    : ''

  const prepareCommit = async () => {
    if (!selectedWithPolicy || !target || targetError || policyError) return
    setBusy(true)
    setError('')
    try {
      const latest = await fetchFileContent(config, target.path)
      const rule = candidateToRule(selectedWithPolicy, inlineComment)
      const parsed = parseFile(latest.content)
      const duplicate = findDuplicateRule(parsed.rules, selectedWithPolicy)
      if (duplicate) {
        setError(`该规则已存在于线上规则第 ${duplicate.ruleNumber} 行：${formatRule(duplicate.rule)}`)
        return
      }

      const inserted = insertAsFirstRule(parsed, rule)
      setPending({
        config,
        target,
        candidate: rule,
        policy: selectedPolicy,
        content: serializeFile(inserted, inserted.rules),
        sha: latest.sha,
      })
      setPhase('confirm')
    } catch (caught: any) {
      setError(caught?.message ?? '读取线上规则失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  const confirmCommit = async () => {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      const ruleText = formatRule(pending.candidate)
      const result = await commitFileContent(
        pending.config,
        pending.target.path,
        pending.content,
        pending.sha,
        `Add ${ruleText} via share`,
      )
      if (result.ok) {
        saveLastSelectedPolicy(pending.policy)
        setPhase('success')
        return
      }
      if (result.status === 409) {
        setPending(null)
        setPhase('edit')
        setError('远端文件已发生变化，请再次点击“添加到线上规则”以重新获取后确认。')
        return
      }
      setError(result.error ?? '提交失败，请稍后重试。')
    } catch (caught: any) {
      setError(caught?.message ?? '提交失败，请检查网络后重试。')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'success' && pending) {
    return (
      <List
        navigationTitle="添加成功"
        toolbar={{ topBarTrailing: <Button title="完成" action={dismiss} /> }}
      >
        <Section>
          <VStack alignment="leading" spacing={8}>
            <Text foregroundStyle="systemGreen" bold>规则已添加到线上规则第一行</Text>
            <Text>{formatRule(pending.candidate)}</Text>
          </VStack>
        </Section>
        <Section header={<Text>目标文件</Text>}>
          <Text>{pending.target.owner}/{pending.target.repo}</Text>
          <Text>{pending.target.branch} · {pending.target.path}</Text>
        </Section>
      </List>
    )
  }

  if (phase === 'confirm' && pending) {
    return (
      <List
        navigationTitle="确认添加"
        toolbar={{
          topBarLeading: (
            <Button
              title="返回"
              disabled={busy}
              action={() => {
                setError('')
                setPending(null)
                setPhase('edit')
              }}
            />
          ),
          topBarTrailing: (
            <Button
              title={busy ? '提交中…' : '确认提交'}
              disabled={busy}
              action={confirmCommit}
            />
          ),
        }}
      >
        {error ? (
          <Section>
            <Text foregroundStyle="systemRed">{error}</Text>
          </Section>
        ) : null}
        <Section header={<Text>新增规则</Text>} footer={<Text>将插入文件头注释之后、现有规则之前</Text>}>
          <Text>{formatRule(pending.candidate)}</Text>
          <Text foregroundStyle="secondaryLabel">规则区第一行</Text>
        </Section>
        <Section header={<Text>目标文件</Text>}>
          <Text>{pending.target.owner}/{pending.target.repo}</Text>
          <Text>{pending.target.branch} · {pending.target.path}</Text>
        </Section>
        <Section header={<Text>提交说明</Text>}>
          <Text font="caption">Add {formatRule(pending.candidate)} via share</Text>
        </Section>
      </List>
    )
  }

  return (
    <List
      navigationTitle="新建代理规则"
      toolbar={{
        topBarLeading: <Button title="关闭" systemImage="xmark" action={dismiss} />,
        bottomBar: (
          <Button
            title={busy ? '读取线上规则中…' : '添加到线上规则'}
            disabled={busy || !selectedWithPolicy || Boolean(targetError) || Boolean(policyError)}
            buttonStyle="borderedProminent"
            action={prepareCommit}
          />
        ),
      }}
    >
      <Section header={<Text>分享的文字</Text>}>
        <TextField
          title="文字"
          value={input}
          disabled={busy}
          onChanged={value => {
            setInput(value)
            setError('')
          }}
          prompt="域名、URL 或 IP 地址"
          axis="vertical"
          autocorrectionDisabled
          textInputAutocapitalization="never"
        />
      </Section>

      {targetError ? (
        <Section>
          <Text foregroundStyle="systemOrange">{targetError}</Text>
        </Section>
      ) : null}

      {policyError ? (
        <Section>
          <Text foregroundStyle="systemOrange">{policyError}</Text>
        </Section>
      ) : null}

      {error ? (
        <Section>
          <Text foregroundStyle="systemRed">{error}</Text>
        </Section>
      ) : null}

      {candidates.length > 0 ? (
        <Section header={<Text>选择规则样式</Text>}>
          <Picker
            title="规则"
            value={selected?.id ?? ''}
            onChanged={(value: string) => setSelectedId(value)}
            pickerStyle="inline"
          >
            {candidates.map(candidate => (
              <CandidateLabel key={candidate.id} candidate={candidate} />
            ))}
          </Picker>
        </Section>
      ) : (
        <Section>
          <Text foregroundStyle="secondaryLabel">
            未找到有效的域名、URL 或 IP 地址。
          </Text>
        </Section>
      )}

      {policies.length > 0 ? (
        <Section header={<Text>选择策略</Text>}>
          <Picker
            title="策略"
            value={selectedPolicy}
            disabled={busy}
            onChanged={(value: string) => {
              setSelectedPolicy(value)
              setError('')
            }}
            pickerStyle="navigationLink"
          >
            {policies.map(policy => (
              <Text key={policy} tag={policy}>{policy}</Text>
            ))}
          </Picker>
        </Section>
      ) : null}

      {candidates.length > 0 ? (
        <Section header={<Text>行内注释（选填）</Text>}>
          <TextField
            title="注释"
            value={inlineComment}
            disabled={busy}
            onChanged={value => {
              setInlineComment(Array.from(value.replace(INLINE_COMMENT_NEWLINES, ' ')).slice(0, 200).join(''))
              setError('')
            }}
            prompt="如 分享自 appinn（最多 200 字）"
            axis="horizontal"
            autocorrectionDisabled
          />
        </Section>
      ) : null}
    </List>
  )
}

function IntentView() {
  // Safari 分享网址时输入走 urlsParameter（textsParameter 为空），
  // 因此需要优先读文本，为空时回退到 URL 列表。
  const initialText =
    Intent.textsParameter?.filter(Boolean).join('\n') ||
    Intent.urlsParameter?.filter(Boolean).join('\n') ||
    ''
  return (
    <NavigationStack>
      <IntentApp initialText={initialText} />
    </NavigationStack>
  )
}

async function run() {
  try {
    await Navigation.present({ element: <IntentView /> })
  } finally {
    Script.exit()
  }
}

run()
