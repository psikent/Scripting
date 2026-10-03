import {
  Script,
  Navigation,
  NavigationStack,
  NavigationLink,
  List,
  Section,
  Picker,
  TextField,
  Button,
  Text,
  HStack,
  Spacer,
  ProgressView,
  Image,
  fetch,
} from "scripting"
import { useState, useCallback, useEffect } from "scripting"

// ========== 图标仓库配置 ==========

interface IconRepo {
  label: string
  owner: string
  repo: string
  branch: string
  iconDirs: string[]
}

const REPOS: IconRepo[] = [
  { label: "lige47/lige_icon", owner: "lige47", repo: "lige_icon", branch: "main", iconDirs: ["icon"] },
  { label: "xream/Qure", owner: "xream", repo: "Qure", branch: "master", iconDirs: ["IconSet"] },
  { label: "Koolson/Qure", owner: "Koolson", repo: "Qure", branch: "master", iconDirs: ["IconSet"] },
  { label: "Orz-3/mini", owner: "Orz-3", repo: "mini", branch: "master", iconDirs: ["Color", "Alpha"] },
]

// 支持的图片扩展名
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp"]

// git trees API 树项
interface GitTreeItem {
  path: string
  type: "blob" | "tree"
  size?: number
}

// 图标搜索结果项
interface IconResult {
  name: string
  path: string
  displayName: string
  rawUrl: string
}

// Pasteboard 全局声明
declare namespace Pasteboard {
  function setString(value: string): Promise<void>
}

// 判断是否图片文件
function isImageFile(name: string): boolean {
  const lower = name.toLowerCase()
  return IMAGE_EXTS.some(ext => lower.endsWith(ext))
}

// 构造 raw URL
function buildRawUrl(repo: IconRepo, path: string): string {
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repo.branch}/${encodeURI(path)}`
}

// 获取仓库图标文件列表（git trees recursive，不受 1000 文件限制）
async function fetchIcons(repo: IconRepo): Promise<IconResult[]> {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${repo.branch}?recursive=1`
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json" },
  })
  if (!response.ok) {
    throw new Error(`GitHub API 请求失败: ${response.status}`)
  }
  const data = await response.json()
  const tree: GitTreeItem[] = data.tree

  const icons: IconResult[] = []
  for (const item of tree) {
    if (item.type !== "blob") continue
    const inIconDir = repo.iconDirs.some(dir =>
      item.path === dir || item.path.startsWith(dir + "/")
    )
    if (!inIconDir) continue
    const fileName = item.path.split("/").pop()!
    if (!isImageFile(fileName)) continue
    icons.push({
      name: fileName,
      path: item.path,
      displayName: fileName.replace(/\.[^.]+$/, ""),
      rawUrl: buildRawUrl(repo, item.path),
    })
  }
  icons.sort((a, b) => a.name.localeCompare(b.name))
  return icons
}

// ========== 主页面 ==========

function MainPage() {
  const [selectedRepoLabel, setSelectedRepoLabel] = useState<string>(REPOS[0].label)
  const [searchText, setSearchText] = useState("")
  const [allIcons, setAllIcons] = useState<IconResult[]>([])
  const [loadingIcons, setLoadingIcons] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchIconList = useCallback(async (repo: IconRepo) => {
    setLoadingIcons(true)
    setError(null)
    try {
      const icons = await fetchIcons(repo)
      setAllIcons(icons)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载图标列表失败")
      setAllIcons([])
    } finally {
      setLoadingIcons(false)
    }
  }, [])

  useEffect(() => {
    const repo = REPOS.find(r => r.label === selectedRepoLabel)!
    fetchIconList(repo)
  }, [selectedRepoLabel, fetchIconList])

  const filteredResults = searchText.trim() === ""
    ? allIcons
    : allIcons.filter(icon =>
        icon.name.toLowerCase().includes(searchText.toLowerCase()) ||
        icon.displayName.toLowerCase().includes(searchText.toLowerCase())
      )

  return (
    <NavigationStack>
      <List
        navigationTitle="图标仓库"
        navigationBarTitleDisplayMode="inline"
      >
        <Section title="图标仓库">
          <Picker
            title="选择图标仓库"
            value={selectedRepoLabel}
            onChanged={(value: string) => setSelectedRepoLabel(value)}
          >
            {REPOS.map(repo => (
              <Text key={repo.label} tag={repo.label}>{repo.label}</Text>
            ))}
          </Picker>
        </Section>

        <Section title="搜索图标">
          <TextField
            title="关键词"
            value={searchText}
            onChanged={setSearchText}
            prompt="输入关键词搜索图标..."
            autofocus={false}
          />
        </Section>

        {loadingIcons ? (
          <Section>
            <HStack padding={8}>
              <ProgressView />
              <Text>  加载图标列表中...</Text>
            </HStack>
          </Section>
        ) : error ? (
          <Section>
            <Text>加载失败: {error}</Text>
          </Section>
        ) : (
          <Section title={`搜索结果 (${filteredResults.length})`}>
            {filteredResults.length === 0 ? (
              <Text>{searchText.trim() !== "" ? "未找到匹配的图标" : "请选择图标仓库搜索图标"}</Text>
            ) : (
              filteredResults.map(icon => (
                <NavigationLink
                  key={icon.path}
                  title={icon.name}
                  destination={
                    <IconDetailPage
                      icon={icon}
                      repoLabel={selectedRepoLabel}
                    />
                  }
                />
              ))
            )}
          </Section>
        )}
      </List>
    </NavigationStack>
  )
}

// ========== 图标详情页 ==========

function IconDetailPage({
  icon,
  repoLabel,
}: {
  icon: IconResult
  repoLabel: string
}) {
  const dismiss = Navigation.useDismiss()
  const [copied, setCopied] = useState(false)

  const handleCopyUrl = () => {
    (async () => {
      try {
        await Pasteboard.setString(icon.rawUrl)
        setCopied(true)
        // 2 秒后自动隐藏提示
        setTimeout(() => setCopied(false), 2000)
      } catch (e) {
        // 拷贝失败
      }
    })()
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={icon.displayName}
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="返回" action={dismiss} />
        }}
      >
        <Section title="图标信息">
          <HStack>
            <Text>名称</Text>
            <Spacer />
            <Text>{icon.name}</Text>
          </HStack>
          <HStack>
            <Text>路径</Text>
            <Spacer />
            <Text font={12}>{icon.path}</Text>
          </HStack>
          <HStack>
            <Text>仓库</Text>
            <Spacer />
            <Text>{repoLabel}</Text>
          </HStack>
        </Section>

        <Section title="预览">
          <HStack padding={8}>
            <Spacer />
            <Image
              imageUrl={icon.rawUrl}
              frame={{ width: 160, height: 160 }}
            />
            <Spacer />
          </HStack>
        </Section>

        <Section title="操作">
          <Button
            title="🔗 拷贝 Raw 链接"
            action={handleCopyUrl}
          />
        </Section>

        {copied && (
          <Section>
            <HStack padding={8}>
              <Text>✅ 已拷贝到剪贴板</Text>
              <Spacer />
              <Text font={12}>{icon.name}</Text>
            </HStack>
          </Section>
        )}
      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present(<MainPage />)
  Script.exit()
}

run()
