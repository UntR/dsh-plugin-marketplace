export const PLUGIN_CATEGORIES = [
  'agents-automation',
  'coding-development',
  'search-research',
  'knowledge-memory',
  'files-data',
  'media-creation',
  'communication-integrations',
  'interface-personalization',
  'security-operations',
  'other',
] as const

export type PluginCategory = typeof PLUGIN_CATEGORIES[number]

interface CategorySource {
  name: string
  slug: string
  description: string
  topics: readonly string[]
}

const CATEGORY_RULES: ReadonlyArray<readonly [PluginCategory, readonly string[]]> = [
  ['agents-automation', ['agent*', 'workflow*', 'automation', 'orchestration', 'orchestrator', 'subagent*', 'multi-agent', 'skill*', 'mcp', '工作流', '自动化', '编排', '子代理', '代理', '技能']],
  ['coding-development', ['coding', 'developer*', 'devtool*', 'code-review', 'lint*', 'debug*', 'testing', 'test*', 'git', 'github', 'ide', 'vscode', '代码', '编码', '开发', '调试', '测试']],
  ['search-research', ['search*', 'research', 'browser*', 'crawler*', 'scraper*', 'retrieval', 'web-search', 'bilibili', 'youtube', 'reddit', '搜索', '研究', '浏览器', '检索', '抓取']],
  ['knowledge-memory', ['memory', 'knowledge', 'notes', 'note-taking', 'obsidian', 'rag', 'vector', 'wiki', 'context', 'provenance', '记忆', '知识', '笔记', '上下文', '文档']],
  ['files-data', ['file', 'files', 'filesystem', 'database*', 'postgres*', 'mysql', 'sqlite', 'spreadsheet*', 'excel', 'csv', 'storage', 'upload*', 'download*', '文件', '数据库', '数据', '存储', '表格']],
  ['media-creation', ['vision', 'image*', 'video*', 'audio', 'ocr', 'multimodal', 'speech', 'tts', 'stt', 'screenshot*', 'pdf', 'ppt*', 'diagram*', 'design', '视觉', '图像', '视频', '音频', '语音', '截图', '设计', '绘图', '演示']],
  ['communication-integrations', ['slack', 'notion', 'gitlab', 'feishu', 'lark', 'wechat', 'telegram', 'meeting*', 'calendar', 'email', 'drive', 'oauth', 'integration*', 'connector*', '飞书', '微信', '会议', '日历', '邮件', '集成']],
  ['interface-personalization', ['web-ui', 'ui', 'ux', 'theme*', 'skin*', 'sidebar', 'panel', 'tui', 'desktop', 'desktop-app', 'statusbar', 'status-bar', 'composer', 'conversation', 'desktop-pet', 'pet', '界面', '主题', '皮肤', '侧边栏', '面板', '桌面', '会话', '输入框', '宠物']],
  ['security-operations', ['security', 'privacy', 'auth*', 'audit', 'observability', 'telemetry', 'monitor*', 'logging', 'logs', 'cost*', 'token-usage', 'billing', 'gateway', 'redact*', '安全', '隐私', '认证', '审计', '监控', '日志', '成本', '计费']],
]

function keywordMatches(text: string, keyword: string): boolean {
  if (/[^\x00-\x7f]/.test(keyword)) return text.includes(keyword)
  const prefix = keyword.endsWith('*')
  const value = prefix ? keyword.slice(0, -1) : keyword
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}${prefix ? '[a-z0-9-]*' : ''}(?:$|[^a-z0-9])`, 'i').test(text)
}

function score(text: string, keywords: readonly string[]): number {
  return keywords.reduce((total, keyword) => total + (keywordMatches(text, keyword) ? 1 : 0), 0)
}

export function classifyPluginCategory(source: CategorySource): PluginCategory {
  const topicText = source.topics.join(' ').toLocaleLowerCase()
  const identityText = `${source.name} ${source.slug}`.toLocaleLowerCase()
  const descriptionText = source.description.toLocaleLowerCase()
  let best: PluginCategory = 'other'
  let bestScore = 0
  for (const [category, keywords] of CATEGORY_RULES) {
    const categoryScore = score(topicText, keywords) * 10
      + score(identityText, keywords) * 3
      + score(descriptionText, keywords) * 2
    if (categoryScore > bestScore) {
      best = category
      bestScore = categoryScore
    }
  }
  return best
}
