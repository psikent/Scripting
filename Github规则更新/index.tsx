import {
  NavigationStack,
  List,
  Section,
  TextField,
  Button,
  Text,
  Picker,
  ForEach,
  HStack,
  VStack,
  Spacer,
  Image,
  EditButton,
  useObservable,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Navigation,
  Script,
} from 'scripting'

import {
  ALL_TYPES,
  RAW_TYPE,
  ParsedFile,
  Rule,
  RuleStatus,
  createStandaloneComment,
  formatRule,
  insertStandaloneCommentBeforeFirstRule,
  insertRuleAtStart,
  isStandaloneComment,
  newId,
  normalizeInlineComment,
  normalizeStandaloneComment,
  parseFile,
  parseTrailingPolicy,
  serializeFile,
  setTrailingPolicy,
} from './rule-core'
import {
  Config,
  commitFileContent,
  encodeURIPath,
  fetchFileContent,
  friendlyError,
  getConfig,
  ghGet,
  saveConfig,
  saveLastRuleFileTarget,
} from './github-rules'
import { parsePolicyText } from './github-core'

declare const Storage: {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): boolean
}

// =============== 类型与常量 ===============

interface FileItem {
  id: string
  name: string
  path: string
  sha: string
}

interface BrowserItem {
  id: string                      // 用于 ForEach key（即 path）
  name: string
  path: string                    // 完整路径
  type: 'file' | 'dir'
  sha: string
  size: number                    // 字节，仅 file 有意义
}

const LAST_PATH_KEY = 'github_last_path'   // 记忆上次浏览到的目录

// =============== Path 工具 ===============

/** 取上级目录路径（根目录返回 ''） */
function parentPath(p: string): string {
  const segs = p.split('/').filter(Boolean)
  segs.pop()
  return segs.join('/')
}

/** 文件大小友好显示 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// =============== GitHub 接口 ===============

/** 列目录：返回文件夹 + 文件，文件夹优先，按名字升序 */
async function fetchFolderContents(cfg: Config, path: string): Promise<BrowserItem[]> {
  const ref = encodeURIComponent(cfg.branch || 'main')
  const url = path
    ? `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIPath(path)}?ref=${ref}`
    : `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents?ref=${ref}`
  const res = await ghGet(url, cfg.token)
  if (!res.ok) throw friendlyError(res.status)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('该路径不是文件夹')
  return data
    .map((it: any) => ({
      id: it.path,
      name: it.name,
      path: it.path,
      type: it.type === 'dir' ? 'dir' : 'file',
      sha: it.sha,
      size: it.size ?? 0,
    } as BrowserItem))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

// =============== 配置页 ===============

function ConfigView({ onBack }: { onBack: () => void }) {
  const config = getConfig()
  const token = useObservable(config.token)
  const owner = useObservable(config.owner)
  const repo = useObservable(config.repo)
  const path = useObservable(config.path)
  const branch = useObservable(config.branch)
  const policiesText = useObservable(config.policies.join('\n'))
  const configError = useObservable('')

  return (
    <List
      navigationTitle="配置"
      toolbar={{ topBarLeading: <Button title="返回" action={onBack} /> }}
    >
      <Section
        header={<Text>GitHub 配置</Text>}
        footer={<Text>私有仓库需要 token 包含 repo scope（classic）或对该仓库的 Read & Write 权限（fine-grained）</Text>}
      >
        <TextField title="Token" value={token} prompt="GitHub Token" />
        <TextField title="用户名" value={owner} prompt="GitHub 用户名" />
        <TextField title="仓库名" value={repo} prompt="仓库名称" />
        <TextField title="起始路径" value={path} prompt="留空则从仓库根目录开始" />
        <TextField title="分支" value={branch} prompt="默认 main" />
      </Section>
      <Section
        header={<Text>预置策略</Text>}
        footer={<Text>每行一个策略；允许空格、中文和 Emoji，但不能包含逗号。</Text>}
      >
        <TextField
          title="策略"
          value={policiesText}
          prompt="例如：Proxy、DIRECT"
          axis="vertical"
          lineLimit={{ min: 3, max: 8 }}
          autocorrectionDisabled
          textInputAutocapitalization="never"
        />
      </Section>
      {configError.value ? (
        <Section>
          <Text foregroundStyle="systemRed">{configError.value}</Text>
        </Section>
      ) : null}
      <Section>
        <Button
          title="保存配置"
          action={() => {
            const parsedPolicies = parsePolicyText(policiesText.value)
            if (parsedPolicies.invalidPolicies.length > 0) {
              configError.setValue(`策略名称不能包含逗号：${parsedPolicies.invalidPolicies.join('、')}`)
              return
            }
            saveConfig({
              token: token.value.trim(),
              owner: owner.value.trim(),
              repo: repo.value.trim(),
              path: path.value.trim(),
              branch: branch.value.trim() || 'main',
              policies: parsedPolicies.policies,
            })
            onBack()
          }}
        />
      </Section>
    </List>
  )
}

// =============== 仓库浏览器 ===============

const FILE_SIZE_LIMIT = 1024 * 1024  // 1MB，超过则不让进编辑器

function BrowserView({
  currentPath, onNavigate, onPickFile, onConfig,
}: {
  currentPath: string
  onNavigate: (newPath: string) => void
  onPickFile: (f: FileItem, sha: string, parsed: ParsedFile) => void
  onConfig: () => void
}) {
  const items = useObservable<BrowserItem[]>([])
  const loading = useObservable(false)
  const errorMsg = useObservable('')
  const showToast = useObservable(false)
  const toastMsg = useObservable('')

  const showMsg = (msg: string) => {
    toastMsg.setValue(msg)
    showToast.setValue(true)
  }

  const refresh = async () => {
    const cfg = getConfig()
    if (!cfg.token || !cfg.owner || !cfg.repo) {
      errorMsg.setValue('请先配置 GitHub 信息')
      items.setValue([])
      return
    }
    loading.setValue(true)
    errorMsg.setValue('')
    try {
      items.setValue(await fetchFolderContents(cfg, currentPath))
    } catch (e: any) {
      errorMsg.setValue(e.message ?? '获取失败')
      items.setValue([])
    }
    loading.setValue(false)
  }

  // currentPath 变化时重新拉
  useEffect(() => { refresh() }, [currentPath])

  const openFile = async (f: BrowserItem) => {
    if (f.size > FILE_SIZE_LIMIT) {
      showMsg(`文件过大（${formatSize(f.size)}），暂不支持编辑`)
      return
    }
    const cfg = getConfig()
    loading.setValue(true)
    try {
      const { content, sha } = await fetchFileContent(cfg, f.path)
      const parsed = parseFile(content)
      saveLastRuleFileTarget(cfg, f.path, f.name)
      onPickFile({ id: f.id, name: f.name, path: f.path, sha }, sha, parsed)
    } catch (e: any) {
      showMsg(e.message ?? '读取失败')
    }
    loading.setValue(false)
  }

  // 派生：分组后的目录与文件
  const dirs = useMemo(
    () => items.value.filter(it => it.type === 'dir'),
    [items.value],
  )
  const files = useMemo(
    () => items.value.filter(it => it.type === 'file'),
    [items.value],
  )

  const isRoot = !currentPath
  const segs = currentPath.split('/').filter(Boolean)
  const lastSeg = segs[segs.length - 1] ?? ''
  const cfg = getConfig()
  const navTitle = isRoot ? (cfg.repo || '仓库') : lastSeg

  const goUp = () => onNavigate(parentPath(currentPath))

  return (
    <List
      navigationTitle={navTitle}
      toast={{ isPresented: showToast, message: toastMsg.value, position: 'bottom' }}
      toolbar={{
        topBarLeading: !isRoot
          ? <Button title="上级" systemImage="chevron.up" action={goUp} />
          : undefined,
        topBarTrailing: <Button title="配置" action={onConfig} />,
      }}
    >
      {/* 当前路径 + 操作 */}
      <Section
        header={<Text>当前位置</Text>}
        footer={<Text>{isRoot ? `仓库根目录 (${cfg.owner}/${cfg.repo || '?'})` : currentPath}</Text>}
      >
        <Button
          title={loading.value ? '加载中…' : '刷新'}
          disabled={loading.value}
          action={refresh}
        />
        {!isRoot ? (
          <Button title="返回根目录" action={() => onNavigate('')} />
        ) : null}
      </Section>

      {/* 错误 */}
      {errorMsg.value ? (
        <Section>
          <Text foregroundStyle="systemRed">{errorMsg.value}</Text>
        </Section>
      ) : null}

      {/* 文件夹分组 */}
      {dirs.length > 0 ? (
        <Section header={<Text>文件夹 ({dirs.length})</Text>}>
          {dirs.map(d => (
            <Button
              key={d.id}
              title={d.name}
              systemImage="folder.fill"
              action={() => onNavigate(d.path)}
            />
          ))}
        </Section>
      ) : null}

      {/* 文件分组 */}
      {files.length > 0 ? (
        <Section
          header={<Text>文件 ({files.length})</Text>}
          footer={<Text>点击文件进入编辑模式</Text>}
        >
          {files.map(f => (
            <Button key={f.id} action={() => openFile(f)}>
              <HStack spacing={8}>
                <Image systemName="doc.text" foregroundStyle="secondaryLabel" />
                <Text>{f.name}</Text>
                <Spacer />
                <Text font="caption" foregroundStyle="secondaryLabel">
                  {formatSize(f.size)}
                </Text>
              </HStack>
            </Button>
          ))}
        </Section>
      ) : null}

      {/* 空目录 */}
      {!loading.value && !errorMsg.value && items.value.length === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">空文件夹</Text>
        </Section>
      ) : null}
    </List>
  )
}

// =============== 单条规则的行视图 ===============

function statusBadge(status: RuleStatus): { text: string; color: 'green' | 'orange' } | null {
  if (status === 'added') return { text: '+', color: 'green' }
  if (status === 'modified') return { text: '~', color: 'orange' }
  return null
}

function RuleRow({
  rule, onTap,
}: {
  rule: Rule
  onTap: () => void
}) {
  const badge = statusBadge(rule.status)
  if (rule.type === RAW_TYPE) {
    if (isStandaloneComment(rule.value)) {
      return (
        <Button key={rule.id} action={onTap}>
          <HStack spacing={8}>
            {badge ? (
              <Text foregroundStyle={badge.color} font="caption" bold>
                {badge.text}
              </Text>
            ) : null}
            <Text foregroundStyle="secondaryLabel" font="caption">{rule.value}</Text>
            <Spacer />
          </HStack>
        </Button>
      )
    }
    return (
      <Text key={rule.id} foregroundStyle="secondaryLabel" font="caption">
        {rule.value || '(空行)'}
      </Text>
    )
  }
  return (
    <Button key={rule.id} action={onTap}>
      <HStack spacing={8}>
        {badge ? (
          <Text foregroundStyle={badge.color} font="caption" bold>
            {badge.text}
          </Text>
        ) : null}
        <Text font="caption" foregroundStyle="secondaryLabel">{rule.type}</Text>
        <Text>{rule.value}</Text>
        {rule.trailing ? (
          <Text font="caption" foregroundStyle="secondaryLabel">{rule.trailing}</Text>
        ) : null}
        <Spacer />
      </HStack>
    </Button>
  )
}

function CommentEditorView({
  rule, title, onSave, onCancel, onDelete,
}: {
  rule: Rule
  title: string
  onSave: (next: Rule) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const value = useObservable(rule.value || '#')
  const error = useObservable('')

  const save = () => {
    try {
      const normalized = normalizeStandaloneComment(value.value)
      onSave({
        ...rule,
        type: RAW_TYPE,
        value: normalized,
        trailing: '',
        comment: '',
      })
    } catch (caught: any) {
      error.setValue(caught?.message ?? '注释内容不合法')
    }
  }

  return (
    <List
      navigationTitle={title}
      toolbar={{
        topBarLeading: <Button title="取消" action={onCancel} />,
        topBarTrailing: <Button title="完成" action={save} />,
      }}
    >
      {error.value ? (
        <Section>
          <Text foregroundStyle="systemRed">{error.value}</Text>
        </Section>
      ) : null}

      <Section
        header={<Text>注释内容</Text>}
        footer={<Text>仅支持单行；未输入 # 时保存会自动补上。</Text>}
      >
        <TextField
          title="注释"
          value={value}
          prompt="# 注释内容"
          autocorrectionDisabled
          textInputAutocapitalization="never"
          autofocus={rule.status === 'added'}
        />
      </Section>

      {onDelete ? (
        <Section>
          <Button title="删除此注释" role="destructive" action={onDelete} />
        </Section>
      ) : null}
    </List>
  )
}

// =============== 单条规则编辑/新增 Sheet ===============

function RuleEditorView({
  rule, title, knownTypes, onSave, onCancel, onDelete,
}: {
  rule: Rule
  title: string
  knownTypes: string[]
  onSave: (next: Rule) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const type = useObservable(rule.type === RAW_TYPE ? '' : rule.type)
  const value = useObservable(rule.value)
  const trailing = useObservable(rule.trailing)
  // 行内注释预填 //（无注释时），保存时由 normalizeInlineComment 清理空前缀
  const comment = useObservable(rule.comment || '// ')
  // 配置页预置的策略（如 Proxy、DIRECT），用于 Picker 快速选择
  const policies = getConfig().policies
  const currentPolicy = parseTrailingPolicy(trailing.value, policies)
  const error = useObservable('')

  const save = () => {
    const t = type.value.trim().toUpperCase()
    const v = value.value.trim()
    if (!t || !/^[A-Z][A-Z0-9-]*$/.test(t)) {
      error.setValue('类型不合法（示例：DOMAIN-SUFFIX）')
      return
    }
    if (!v) {
      error.setValue('值不能为空')
      return
    }
    let tr = trailing.value.trim()
    if (tr && !tr.startsWith(',')) tr = ',' + tr
    onSave({ ...rule, type: t, value: v, trailing: tr, comment: normalizeInlineComment(comment.value) })
  }

  return (
    <List
      navigationTitle={title}
      toolbar={{
        topBarLeading: <Button title="取消" action={onCancel} />,
        topBarTrailing: <Button title="完成" action={save} />,
      }}
    >
      {error.value ? (
        <Section>
          <Text foregroundStyle="systemRed">{error.value}</Text>
        </Section>
      ) : null}

      <Section header={<Text>类型</Text>} footer={<Text>大写字母 + 短横线，如 DOMAIN-SUFFIX</Text>}>
        <TextField
          title="类型"
          value={type}
          prompt="如 DOMAIN-SUFFIX"
          autocorrectionDisabled
          textInputAutocapitalization="characters"
        />
        {knownTypes.length > 0 ? (
          <Picker
            title="从已有类型选择"
            value={type.value}
            onChanged={(v: string) => { if (v) type.setValue(v) }}
            pickerStyle="menu"
          >
            <Text tag="">— 选择 —</Text>
            {knownTypes.map(t => (
              <Text key={t} tag={t}>{t}</Text>
            ))}
          </Picker>
        ) : null}
      </Section>

      <Section header={<Text>值</Text>} footer={<Text>例如 github.io、1.2.3.4/24</Text>}>
        <TextField
          title="值"
          value={value}
          prompt="规则值"
          autocorrectionDisabled
          textInputAutocapitalization="never"
          autofocus={!rule.value}
        />
      </Section>

      <Section
        header={<Text>策略（可选）</Text>}
        footer={<Text>从预置策略中选择，或手动输入策略与参数，逗号分隔（保存时自动补上前导逗号）</Text>}
      >
        {policies.length > 0 ? (
          <Picker
            title="从预置策略选择"
            value={currentPolicy}
            onChanged={(v: string) => { trailing.setValue(setTrailingPolicy(trailing.value, v, policies)) }}
            pickerStyle="menu"
          >
            <Text tag="">— 无 —</Text>
            {policies.map(policy => (
              <Text key={policy} tag={policy}>{policy}</Text>
            ))}
          </Picker>
        ) : null}
        <TextField title="策略" value={trailing} prompt=",Proxy,no-resolve" autocorrectionDisabled textInputAutocapitalization="never" />
      </Section>

      <Section header={<Text>注释（可选）</Text>}>
        <TextField title="注释" value={comment} prompt="// 备注" autocorrectionDisabled textInputAutocapitalization="never" />
      </Section>

      {onDelete ? (
        <Section>
          <Button title="删除此规则" role="destructive" action={onDelete} />
        </Section>
      ) : null}
    </List>
  )
}

// =============== Diff & 提交 Sheet ===============

interface ModifiedPair { before: Rule; after: Rule }

function DiffView({
  fileName, added, modified, deleted, reorder, moved, message, busy, onCancel, onConfirm,
}: {
  fileName: string
  added: Rule[]
  modified: ModifiedPair[]
  deleted: Rule[]
  reorder: boolean
  moved: { rule: Rule; oldIndex: number; newIndex: number }[]
  message: { value: string; setValue: (s: string) => void; readonly setValue2?: never } & { value: string }
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  // 注意：上面 message 类型用宽松形式，因为它是 Observable<string>
  const total = added.length + modified.length + deleted.length + (reorder ? 1 : 0)
  const movedPreview = moved.slice(0, 30)
  const movedRest = Math.max(0, moved.length - movedPreview.length)

  return (
    <List
      navigationTitle="确认提交"
      toolbar={{
        topBarLeading: <Button title="取消" disabled={busy} action={onCancel} />,
        topBarTrailing: (
          <Button
            title={busy ? '提交中…' : `确认提交 (${total})`}
            disabled={busy || total === 0}
            action={onConfirm}
          />
        ),
      }}
    >
      <Section header={<Text>{fileName}</Text>} footer={<Text>提交后将直接写入远端 main 分支</Text>}>
        <TextField title="commit message" value={message as any} prompt="提交说明" axis="vertical" />
      </Section>

      {added.length > 0 ? (
        <Section header={<Text foregroundStyle="systemGreen">+ 新增 {added.length}</Text>}>
          {added.map(r => (
            <Text key={r.id} foregroundStyle="systemGreen" font="caption">
              {formatRule(r)}
            </Text>
          ))}
        </Section>
      ) : null}

      {modified.length > 0 ? (
        <Section header={<Text foregroundStyle="systemOrange">~ 修改 {modified.length}</Text>}>
          {modified.map(({ before, after }) => (
            <VStack key={after.id} alignment="leading" spacing={2}>
              <Text foregroundStyle="systemRed" font="caption">- {formatRule(before)}</Text>
              <Text foregroundStyle="systemGreen" font="caption">+ {formatRule(after)}</Text>
            </VStack>
          ))}
        </Section>
      ) : null}

      {deleted.length > 0 ? (
        <Section header={<Text foregroundStyle="systemRed">- 删除 {deleted.length}</Text>}>
          {deleted.map(r => (
            <Text key={r.id} foregroundStyle="systemRed" font="caption" strikethrough="systemRed">
              {formatRule(r)}
            </Text>
          ))}
        </Section>
      ) : null}

      {reorder ? (
        <Section
          header={<Text foregroundStyle="systemBlue">↕ 顺序变化 {moved.length > 0 ? `(${moved.length})` : ''}</Text>}
          footer={
            movedRest > 0
              ? <Text>已省略其余 {movedRest} 项 · 提交时按当前列表顺序写入</Text>
              : <Text>提交后按当前列表顺序写入文件</Text>
          }
        >
          {movedPreview.length > 0 ? (
            movedPreview.map(m => (
              <Text key={m.rule.id} foregroundStyle="systemBlue" font="caption">
                {`第 ${m.oldIndex + 1} → ${m.newIndex + 1} 行  ${formatRule(m.rule)}`}
              </Text>
            ))
          ) : (
            <Text foregroundStyle="secondaryLabel" font="caption">
              规则的相对顺序已被调整
            </Text>
          )}
        </Section>
      ) : null}

      {total === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">没有任何变更</Text>
        </Section>
      ) : null}
    </List>
  )
}

// =============== 编辑器主页 ===============

function EditorView({
  file, sha, parsed, onBack,
}: {
  file: FileItem
  sha: string
  parsed: ParsedFile
  onBack: () => void
}) {
  // === 状态 ===
  const rules = useObservable<Rule[]>(parsed.rules)
  // 已删除的「原本就在文件里」的规则快照（用于 diff 展示）
  const deletedSnapshots = useObservable<Rule[]>([])
  // 当前编辑/新增 Sheet
  const editingId = useObservable<string | null>(null)
  const draftRule = useObservable<Rule | null>(null)
  const showDiff = useObservable(false)
  const showToast = useObservable(false)
  const toastMsg = useObservable('')
  const submitting = useObservable(false)
  // 筛选
  const typeFilter = useObservable(ALL_TYPES)
  const searchText = useObservable('')
  // 提交 sha & 提交信息
  const currentSha = useObservable(sha)
  const commitMessage = useObservable('')
  // 新增规则时默认的类型
  const lastUsedType = useObservable(
    parsed.rules.find(r => r.type !== RAW_TYPE)?.type ?? 'DOMAIN-SUFFIX',
  )

  // 原始快照 Map（用于检测「修改」&「删除原项」）。useRef 不触发重渲。
  const originalRef = useRef<Map<string, Rule> | null>(null)
  if (!originalRef.current) {
    originalRef.current = new Map(parsed.rules.map(r => [r.id, r]))
  }
  // 原始位置序列（用于检测「拖拽排序」）
  const originalOrderRef = useRef<string[] | null>(null)
  if (!originalOrderRef.current) {
    originalOrderRef.current = parsed.rules.map(r => r.id)
  }
  const getOriginal = (id: string) => originalRef.current!.get(id)

  const showMsg = (msg: string) => {
    toastMsg.setValue(msg)
    showToast.setValue(true)
  }

  // === 派生数据 ===
  const distinctTypes = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const r of rules.value) {
      if (r.type === RAW_TYPE) continue
      if (!seen.has(r.type)) {
        seen.add(r.type)
        out.push(r.type)
      }
    }
    return out
  }, [rules.value])

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of rules.value) {
      if (r.type === RAW_TYPE) continue
      m[r.type] = (m[r.type] ?? 0) + 1
    }
    return m
  }, [rules.value])

  const filteredRules = useMemo(() => {
    const q = searchText.value.trim().toLowerCase()
    const ft = typeFilter.value
    return rules.value.filter(r => {
      if (r.type === RAW_TYPE) {
        // 仅在「全部 + 无搜索」时显示原样行
        return ft === ALL_TYPES && !q
      }
      if (ft !== ALL_TYPES && r.type !== ft) return false
      if (q && !r.value.toLowerCase().includes(q) && !r.type.toLowerCase().includes(q)) return false
      return true
    })
  }, [rules.value, typeFilter.value, searchText.value])

  const stats = useMemo(() => {
    let added = 0, modified = 0
    for (const r of rules.value) {
      if (r.status === 'added') added++
      else if (r.status === 'modified') modified++
    }
    const deleted = deletedSnapshots.value.length
    // 检测拖拽排序：仅看「原本就在文件里」的规则的相对顺序
    const origOrder = originalOrderRef.current!
    const presentIds = new Set(rules.value.map(r => r.id))
    const expected = origOrder.filter(id => presentIds.has(id))
    const actual = rules.value
      .filter(r => originalRef.current!.has(r.id))
      .map(r => r.id)
    let reorder = false
    if (actual.length === expected.length) {
      for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) { reorder = true; break }
      }
    }
    const total = added + modified + deleted + (reorder ? 1 : 0)
    return { added, modified, deleted, reorder, total }
  }, [rules.value, deletedSnapshots.value])

  // === 操作 ===
  const onMove = useCallback((indices: number[], newOffset: number) => {
    // indices/newOffset 都是相对于当前 filteredRules 的下标
    const fr = filteredRules
    const moving = indices.map(i => fr[i])
    const reduced = fr.filter((_, i) => !indices.includes(i))
    reduced.splice(newOffset, 0, ...moving)

    // 把过滤后的新顺序合并回 master 数组（保持非可见项位置不变）
    const ids = new Set(fr.map(r => r.id))
    let f = 0
    const newMaster = rules.value.map(r => (ids.has(r.id) ? reduced[f++] : r))
    rules.setValue(newMaster)
  }, [filteredRules])

  const onDelete = useCallback((indices: number[]) => {
    const fr = filteredRules
    const idsToDelete = new Set(indices.map(i => fr[i].id))
    const removed: Rule[] = []
    const newMaster = rules.value.filter(r => {
      if (!idsToDelete.has(r.id)) return true
      const orig = getOriginal(r.id)
      if (orig) removed.push(orig)
      return false
    })
    rules.setValue(newMaster)
    if (removed.length > 0) {
      deletedSnapshots.setValue([...deletedSnapshots.value, ...removed])
    }
  }, [filteredRules])

  const startAdd = () => {
    draftRule.setValue({
      id: newId(),
      type: lastUsedType.value || 'DOMAIN-SUFFIX',
      value: '',
      trailing: '',
      comment: '',
      status: 'added',
    })
  }

  const startAddComment = () => {
    draftRule.setValue(createStandaloneComment())
  }

  const saveDraft = (next: Rule) => {
    if (next.type === RAW_TYPE) {
      rules.setValue(insertStandaloneCommentBeforeFirstRule(rules.value, next))
      typeFilter.setValue(ALL_TYPES)
      searchText.setValue('')
    } else {
      rules.setValue(insertRuleAtStart(rules.value, next))
      lastUsedType.setValue(next.type)
    }
    draftRule.setValue(null)
  }

  const editRule = useMemo(
    () => (editingId.value ? rules.value.find(r => r.id === editingId.value) ?? null : null),
    [editingId.value, rules.value],
  )

  const saveEdit = (next: Rule) => {
    const orig = getOriginal(next.id)
    let final = next
    if (orig) {
      const changed = (
        next.type !== orig.type ||
        next.value !== orig.value ||
        next.trailing !== orig.trailing ||
        next.comment !== orig.comment
      )
      final = { ...next, status: changed ? 'modified' : 'unchanged' }
    } else {
      // 新增项保持 'added'
      final = { ...next, status: 'added' }
    }
    rules.setValue(rules.value.map(r => (r.id === next.id ? final : r)))
    if (next.type !== RAW_TYPE) lastUsedType.setValue(next.type)
    editingId.setValue(null)
  }

  const deleteEditing = () => {
    if (!editRule) return
    const id = editRule.id
    const orig = getOriginal(id)
    rules.setValue(rules.value.filter(r => r.id !== id))
    if (orig) {
      deletedSnapshots.setValue([...deletedSnapshots.value, orig])
    }
    editingId.setValue(null)
  }

  // === 提交流程 ===
  const startCommit = () => {
    if (stats.total === 0) {
      showMsg('暂无更改')
      return
    }
    const parts: string[] = []
    if (stats.added) parts.push(`+${stats.added}`)
    if (stats.modified) parts.push(`~${stats.modified}`)
    if (stats.deleted) parts.push(`-${stats.deleted}`)
    if (stats.reorder) parts.push('reorder')
    commitMessage.setValue(`Update ${file.name}: ${parts.join(' ')}`)
    showDiff.setValue(true)
  }

  const commit = async () => {
    submitting.setValue(true)
    try {
      const cfg = getConfig()
      const newContent = serializeFile(parsed, rules.value)
      const result = await commitFileContent(
        cfg, file.path, newContent, currentSha.value, commitMessage.value || `Update ${file.name}`,
      )
      if (result.ok) {
        showMsg('提交成功')
        // 重置基线：所有未删除项变成 unchanged，已删除快照清空
        const reset: Rule[] = rules.value.map(r => ({ ...r, status: 'unchanged' as RuleStatus }))
        rules.setValue(reset)
        deletedSnapshots.setValue([])
        if (result.newSha) currentSha.setValue(result.newSha)
        // 把当前状态作为新基线，避免下次再次提示「已修改」
        originalRef.current = new Map(reset.map(r => [r.id, r]))
        originalOrderRef.current = reset.map(r => r.id)
        showDiff.setValue(false)
      } else {
        showMsg(`提交失败: ${result.error}`)
      }
    } catch (e: any) {
      showMsg(`提交失败: ${e.message ?? '网络错误'}`)
    }
    submitting.setValue(false)
  }

  // === 派生：filtered 中可见项数（用于 header 显示） ===
  const visibleRuleCount = useMemo(
    () => rules.value.filter(r => r.type !== RAW_TYPE).length,
    [rules.value],
  )

  // === 修改对（用于 Diff） ===
  const modifiedPairs = useMemo<ModifiedPair[]>(() => {
    const pairs: ModifiedPair[] = []
    for (const r of rules.value) {
      if (r.status !== 'modified') continue
      const before = getOriginal(r.id)
      if (before) pairs.push({ before, after: r })
    }
    return pairs
  }, [rules.value])

  const addedItems = useMemo(
    () => rules.value.filter(r => r.status === 'added'),
    [rules.value],
  )

  // === 拖拽细节：哪些规则从「原第几行」移到了「现第几行」 ===
  const movedItems = useMemo(() => {
    if (!stats.reorder) return []
    const origOrder = originalOrderRef.current!
    const presentIds = new Set(rules.value.map(r => r.id))
    const expected = origOrder.filter(id => presentIds.has(id))
    const moved: { rule: Rule; oldIndex: number; newIndex: number }[] = []
    let actualIdx = 0
    for (const r of rules.value) {
      if (!originalRef.current!.has(r.id)) continue
      if (expected[actualIdx] !== r.id) {
        const oldIdx = expected.indexOf(r.id)
        if (oldIdx >= 0) {
          moved.push({ rule: r, oldIndex: oldIdx, newIndex: actualIdx })
        }
      }
      actualIdx++
    }
    return moved
  }, [rules.value, stats.reorder])

  // === 渲染 ===
  return (
    <List
      navigationTitle={file.name}
      toast={{ isPresented: showToast, message: toastMsg.value, position: 'bottom' }}
      toolbar={{
        topBarLeading: <Button title="返回" action={onBack} />,
        topBarTrailing: [
          <EditButton key="edit" />,
          <Button
            key="save"
            title={stats.total > 0 ? `保存(${stats.total})` : '保存'}
            disabled={stats.total === 0 || submitting.value}
            action={startCommit}
          />,
        ],
      }}
      sheet={[
        // —— 编辑已有规则 ——
        {
          isPresented: editingId.value !== null && editRule !== null,
          onChanged: (v: boolean) => { if (!v) editingId.setValue(null) },
          content: editRule ? (
            <NavigationStack>
              {editRule.type === RAW_TYPE && isStandaloneComment(editRule.value) ? (
                <CommentEditorView
                  key={editRule.id}
                  rule={editRule}
                  title="编辑注释"
                  onSave={saveEdit}
                  onCancel={() => editingId.setValue(null)}
                  onDelete={deleteEditing}
                />
              ) : (
                <RuleEditorView
                  key={editRule.id}
                  rule={editRule}
                  title="编辑规则"
                  knownTypes={distinctTypes}
                  onSave={saveEdit}
                  onCancel={() => editingId.setValue(null)}
                  onDelete={deleteEditing}
                />
              )}
            </NavigationStack>
          ) : <Text>{''}</Text>,
        },
        // —— 新增规则 ——
        {
          isPresented: draftRule.value !== null,
          onChanged: (v: boolean) => { if (!v) draftRule.setValue(null) },
          content: draftRule.value ? (
            <NavigationStack>
              {draftRule.value.type === RAW_TYPE ? (
                <CommentEditorView
                  key={draftRule.value.id}
                  rule={draftRule.value}
                  title="新增注释"
                  onSave={saveDraft}
                  onCancel={() => draftRule.setValue(null)}
                />
              ) : (
                <RuleEditorView
                  key={draftRule.value.id}
                  rule={draftRule.value}
                  title="新增规则"
                  knownTypes={distinctTypes}
                  onSave={saveDraft}
                  onCancel={() => draftRule.setValue(null)}
                />
              )}
            </NavigationStack>
          ) : <Text>{''}</Text>,
        },
        // —— Diff 预览 & 提交 ——
        {
          isPresented: showDiff,
          content: (
            <NavigationStack>
              <DiffView
                fileName={file.name}
                added={addedItems}
                modified={modifiedPairs}
                deleted={deletedSnapshots.value}
                reorder={stats.reorder}
                moved={movedItems}
                message={commitMessage as any}
                busy={submitting.value}
                onCancel={() => showDiff.setValue(false)}
                onConfirm={commit}
              />
            </NavigationStack>
          ),
        },
      ]}
    >
      {/* 顶部：筛选 */}
      <Section header={<Text>筛选与搜索</Text>}>
        <Picker
          title="类型分组"
          value={typeFilter.value}
          onChanged={(v: string) => typeFilter.setValue(v)}
          pickerStyle="menu"
        >
          <Text tag={ALL_TYPES}>全部 ({visibleRuleCount})</Text>
          {distinctTypes.map(t => (
            <Text key={t} tag={t}>{t} ({typeCounts[t] ?? 0})</Text>
          ))}
        </Picker>
        <TextField
          title="搜索"
          value={searchText}
          prompt="按值或类型搜索"
          autocorrectionDisabled
          textInputAutocapitalization="never"
        />
      </Section>

      {/* 变更条 */}
      {stats.total > 0 ? (
        <Section>
          <HStack spacing={12}>
            <Text foregroundStyle="systemGreen">+{stats.added}</Text>
            <Text foregroundStyle="systemOrange">~{stats.modified}</Text>
            <Text foregroundStyle="systemRed">-{stats.deleted}</Text>
            {stats.reorder ? (
              <Text foregroundStyle="systemBlue">↕ 顺序变化</Text>
            ) : null}
            <Spacer />
            <Text font="caption" foregroundStyle="secondaryLabel">未保存</Text>
          </HStack>
        </Section>
      ) : null}

      {/* 新增按钮 */}
      <Section>
        <Button title="+ 新增规则" action={startAdd} />
        <Button title="+ 新增注释" action={startAddComment} />
      </Section>

      {/* 规则列表 */}
      <Section
        header={<Text>规则 ({filteredRules.length})</Text>}
        footer={
          (searchText.value || typeFilter.value !== ALL_TYPES)
            ? <Text>筛选生效中 · 拖拽排序仅作用于可见项</Text>
            : <Text>左滑删除 · 点击右上角进入编辑模式可拖拽排序</Text>
        }
      >
        <ForEach
          count={filteredRules.length}
          itemBuilder={(i: number) => {
            const r = filteredRules[i]
            return (
              <RuleRow
                key={r.id}
                rule={r}
                onTap={() => {
                  if (r.type === RAW_TYPE && !isStandaloneComment(r.value)) return
                  editingId.setValue(r.id)
                }}
              />
            )
          }}
          onDelete={onDelete}
          onMove={onMove}
        />
      </Section>
    </List>
  )
}

// =============== 顶层路由 ===============

type AppMode =
  | { kind: 'browser' }
  | { kind: 'config' }
  | { kind: 'editor'; file: FileItem; sha: string; parsed: ParsedFile }

function App() {
  const [mode, setMode] = useState<AppMode>({ kind: 'browser' })
  // 浏览路径，跨 mode 切换保持不变；启动时取上次记忆，回退到 config.path，再回退到根
  const [currentPath, setCurrentPath] = useState<string>(() =>
    Storage.get<string>(LAST_PATH_KEY) ?? getConfig().path ?? '',
  )

  const handleNavigate = (newPath: string) => {
    setCurrentPath(newPath)
    Storage.set(LAST_PATH_KEY, newPath)
  }

  if (mode.kind === 'config') {
    return <ConfigView onBack={() => setMode({ kind: 'browser' })} />
  }
  if (mode.kind === 'editor') {
    return (
      <EditorView
        file={mode.file}
        sha={mode.sha}
        parsed={mode.parsed}
        onBack={() => setMode({ kind: 'browser' })}
      />
    )
  }
  return (
    <BrowserView
      currentPath={currentPath}
      onNavigate={handleNavigate}
      onPickFile={(file, sha, parsed) => setMode({ kind: 'editor', file, sha, parsed })}
      onConfig={() => setMode({ kind: 'config' })}
    />
  )
}

function View() {
  return (
    <NavigationStack>
      <App />
    </NavigationStack>
  )
}

Navigation.present({ element: <View /> }).then(() => Script.exit())
