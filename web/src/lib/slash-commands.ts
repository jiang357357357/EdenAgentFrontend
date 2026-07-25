export type SlashCommandName =
  | "help"
  | "compact"
  | "new"
  | "model"
  | "permissions"
  | "settings"
  | "memo"
  | "self-awake"
  | "skills"

export type SlashCommandCapability = "always" | "compact" | "new-session" | "settings" | "memo" | "self-awake" | "skills"

export interface SlashCommandDefinition {
  name: SlashCommandName
  description: string
  aliases?: readonly string[]
  keywords?: readonly string[]
  capability: SlashCommandCapability
  acceptsArguments?: boolean
}

export interface SlashCommandCapabilities {
  compact: boolean
  newSession: boolean
  settings: boolean
  memo: boolean
  selfAwake: boolean
  skills: boolean
}

export interface ParsedSlashCommand {
  name: string
  args: string
}

export const SLASH_COMMANDS: readonly SlashCommandDefinition[] = [
  {
    name: "compact",
    description: "主动压缩当前会话，可追加摘要要求",
    aliases: ["compress"],
    keywords: ["压缩", "上下文", "摘要"],
    capability: "compact",
    acceptsArguments: true,
  },
  {
    name: "model",
    description: "选择当前会话使用的模型",
    keywords: ["模型"],
    capability: "always",
  },
  {
    name: "new",
    description: "开始一个新会话",
    aliases: ["new-session"],
    keywords: ["新会话"],
    capability: "new-session",
  },
  {
    name: "permissions",
    description: "切换智能体的权限模式",
    aliases: ["permission"],
    keywords: ["权限", "授权"],
    capability: "always",
  },
  {
    name: "settings",
    description: "打开智能体设置",
    aliases: ["setting"],
    keywords: ["设置", "配置"],
    capability: "settings",
  },
  {
    name: "memo",
    description: "打开备忘录工作台",
    aliases: ["memos"],
    keywords: ["备忘录", "提醒"],
    capability: "memo",
  },
  {
    name: "self-awake",
    description: "打开自醒观察与日记",
    aliases: ["awake", "selfawake"],
    keywords: ["自醒", "日记"],
    capability: "self-awake",
  },
  {
    name: "skills",
    description: "打开技能管理与安装",
    aliases: ["skill"],
    keywords: ["技能", "安装"],
    capability: "skills",
  },
  {
    name: "help",
    description: "查看所有可用命令",
    aliases: ["commands"],
    keywords: ["帮助", "命令"],
    capability: "always",
  },
]

function hasCapability(command: SlashCommandDefinition, capabilities: SlashCommandCapabilities) {
  switch (command.capability) {
    case "compact":
      return capabilities.compact
    case "new-session":
      return capabilities.newSession
    case "settings":
      return capabilities.settings
    case "memo":
      return capabilities.memo
    case "self-awake":
      return capabilities.selfAwake
    case "skills":
      return capabilities.skills
    default:
      return true
  }
}

export function availableSlashCommands(capabilities: SlashCommandCapabilities) {
  return SLASH_COMMANDS.filter((command) => hasCapability(command, capabilities))
}

export function slashCommandQuery(text: string, cursor: number): string | null {
  const firstLineEnd = text.indexOf("\n") === -1 ? text.length : text.indexOf("\n")
  if (!text.startsWith("/") || cursor < 1 || cursor > firstLineEnd) return null

  const firstLine = text.slice(0, firstLineEnd)
  const whitespaceIndex = firstLine.search(/\s/)
  const commandEnd = whitespaceIndex === -1 ? firstLine.length : whitespaceIndex
  if (cursor > commandEnd) return null

  const query = firstLine.slice(1, cursor)
  if (query.includes("/")) return null
  return query.toLowerCase()
}

export function filterSlashCommands(commands: readonly SlashCommandDefinition[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return [...commands]

  const scored = commands.flatMap((command, index) => {
    const names = [command.name, ...(command.aliases ?? [])]
    const keywords = command.keywords ?? []
    let score = Number.POSITIVE_INFINITY

    if (command.name === normalizedQuery) score = 0
    else if (names.some((name) => name.startsWith(normalizedQuery))) score = 1
    else if (names.some((name) => name.includes(normalizedQuery))) score = 2
    else if (keywords.some((keyword) => keyword.includes(normalizedQuery))) score = 3

    return Number.isFinite(score) ? [{ command, score, index }] : []
  })

  return scored
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ command }) => command)
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  if (!text.startsWith("/") || text.startsWith("//")) return null
  const match = /^\/([^\s/]*)(?:\s+([\s\S]*))?$/.exec(text)
  if (!match) return null
  return {
    name: match[1].toLowerCase(),
    args: (match[2] ?? "").trim(),
  }
}

export function findSlashCommand(commands: readonly SlashCommandDefinition[], name: string) {
  const normalizedName = name.toLowerCase()
  return commands.find(
    (command) => command.name === normalizedName || command.aliases?.includes(normalizedName),
  )
}
