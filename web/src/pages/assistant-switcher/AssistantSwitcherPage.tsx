import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  FileText,
  Info,
  LoaderCircle,
  Search,
  ShieldCheck,
  Smile,
  Sparkles,
  SquareTerminal,
} from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import paperTexture from "../../assets/assistant-switcher-paper.png"
import {
  fetchAssistants,
  getErrorMessage,
  getStoredToken,
  resolveCoreAssetUrl,
  setCurrentAssistant,
  type CoreAssistant,
} from "../../lib/auth"
import { cn } from "../../lib/utils"

const pageMotion = {
  initial: { opacity: 0, x: 18, filter: "blur(3px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: 24, filter: "blur(3px)" },
}

const transition = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
} as const

interface AssistantSwitcherPageProps {
  currentAssistant?: CoreAssistant | null
  onAssistantChanged: (assistant: CoreAssistant) => void
  onBack: () => void
  onOpenSettings: () => void
  mode?: "current" | "participants"
  sessionParticipantIDs?: Array<number | string>
  onParticipantsChanged?: (assistantIds: number[]) => Promise<void> | void
}

function cleanText(value?: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value)
      .replace(/\s+/g, " ")
      .replace(/^[-—·\s]+|[-—·\s]+$/g, "")
      .trim()
    return /^\[object\s+Object\]$/i.test(text) ? "" : text
  }

  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean).join("、")
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const key of ["summary", "description", "text", "personality", "traits", "surface", "core"]) {
      const text = cleanText(record[key])
      if (text) return text
    }
    return Object.values(record)
      .filter((item) => typeof item === "string" || typeof item === "number")
      .map((item) => cleanText(item))
      .filter(Boolean)
      .join("、")
  }

  return ""
}

function truncateText(value: string, limit: number) {
  if (value.length <= limit) return value
  return `${value.slice(0, Math.max(1, limit - 1)).trim()}…`
}

function assistantName(assistant: CoreAssistant) {
  return cleanText(assistant.name) || cleanText(assistant.character?.name) || "未命名助手"
}

function assistantSummary(assistant: CoreAssistant, compact = false) {
  const character = assistant.character
  const source =
    cleanText(character?.setting_summary) ||
    cleanText(character?.description) ||
    cleanText(character?.signature) ||
    `${assistantName(assistant)}会以自己的方式陪你继续当前工作。`
  const firstSentence = source.split(/[。！？!?]/)[0] || source
  return truncateText(firstSentence, compact ? 18 : 62)
}

function assistantSignature(assistant: CoreAssistant) {
  const signature = cleanText(assistant.character?.signature)
  return signature ? truncateText(signature, 28) : "暂无个性签名"
}

function personalitySummary(assistant: CoreAssistant) {
  const source = cleanText(assistant.character?.personality) || assistantSummary(assistant)
  return truncateText(source, 34)
}

function avatarUrl(assistant: CoreAssistant) {
  return resolveCoreAssetUrl(
    assistant.character?.avatar_url ||
      assistant.character?.default_standing_image_url ||
      assistant.character?.visual_actions?.find((action) => action.enabled !== false)?.static_image_url,
  )
}

function standeeUrl(assistant: CoreAssistant) {
  const character = assistant.character
  const defaultAction = character?.visual_actions?.find((action) => action.enabled !== false)
  return resolveCoreAssetUrl(
    character?.default_standing_image_url ||
      defaultAction?.dynamic_preview_url ||
      defaultAction?.static_image_url ||
      character?.avatar_url,
  )
}

function modelLabel(assistant: CoreAssistant) {
  return cleanText(assistant.character?.ai_talk_entity_name) || "跟随角色配置"
}

function AssistantAvatar({ assistant, className }: { assistant: CoreAssistant; className?: string }) {
  const src = avatarUrl(assistant)
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#ded8d0] bg-[#fffaf3] text-accent",
        className,
      )}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover object-top" draggable={false} />
      ) : (
        <Bot className="h-[48%] w-[48%]" strokeWidth={1.7} />
      )}
    </span>
  )
}

function AssistantRow({
  assistant,
  selected,
  current,
  onSelect,
  multi = false,
  checked = false,
}: {
  assistant: CoreAssistant
  selected: boolean
  current: boolean
  onSelect: () => void
  multi?: boolean
  checked?: boolean
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "group relative flex min-h-[8.8vh] w-full items-center gap-[1.1vw] px-[1.35vw] py-[1.15vh] text-left outline-none transition-colors",
        selected ? "bg-[#fff2df]" : "hover:bg-[#f9f4ec] focus-visible:bg-[#f9f4ec]",
      )}
    >
      {selected ? <span className="absolute inset-y-0 left-0 w-[0.22vw] min-w-[3px] bg-accent" /> : null}
      <AssistantAvatar assistant={assistant} className="h-[6.2vh] w-[6.2vh]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-[0.65vw]">
          <span className="truncate text-[2.1vh] font-medium text-[#302b27]">{assistantName(assistant)}</span>
          {current ? (
            <span className="shrink-0 rounded-[0.35vh] bg-[#fff0dc] px-[0.5vw] py-[0.2vh] text-[1.38vh] text-accent">
              当前助手
            </span>
          ) : null}
        </span>
        <span className="mt-[0.42vh] block truncate text-[1.65vh] text-[#8a8179]">
          {assistantSignature(assistant)}
        </span>
      </span>
      {multi ? (
        <span className={cn(
          "flex h-[2.7vh] w-[2.7vh] shrink-0 items-center justify-center rounded-full border",
          checked ? "border-accent bg-accent text-white" : "border-[#d8d1c9] bg-white/70 text-transparent",
        )}>
          <Check className="h-[1.7vh] w-[1.7vh]" strokeWidth={2.3} />
        </span>
      ) : null}
    </button>
  )
}

export function AssistantSwitcherPage({
  currentAssistant,
  onAssistantChanged,
  onBack,
  onOpenSettings,
  mode = "current",
  sessionParticipantIDs = [],
  onParticipantsChanged,
}: AssistantSwitcherPageProps) {
  const [assistants, setAssistants] = useState<CoreAssistant[]>([])
  const [selectedId, setSelectedId] = useState<number | undefined>(currentAssistant?.id)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()
  const [switchingId, setSwitchingId] = useState<number | undefined>()
  const [notice, setNotice] = useState<string | undefined>()
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    sessionParticipantIDs.map(Number).filter(Number.isFinite),
  )

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setError("登录状态已失效，请重新登录。")
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(undefined)
      try {
        const items = await fetchAssistants(token)
        if (cancelled) return
        const currentId = currentAssistant?.id ?? items.find((item) => item.is_default)?.id
        const ordered = [...items].sort((left, right) => Number(right.id === currentId) - Number(left.id === currentId))
        setAssistants(ordered)
        setSelectedId((current) => current ?? currentId ?? ordered[0]?.id)
        if (mode === "participants") {
          setSelectedIds((current) => current.length ? current : currentId ? [currentId] : ordered[0]?.id ? [ordered[0].id] : [])
        }
      } catch (loadError) {
        if (!cancelled) setError(getErrorMessage(loadError, "助手列表加载失败。"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [mode])

  useEffect(() => {
    if (mode !== "participants") return
    const ids = sessionParticipantIDs.map(Number).filter(Number.isFinite)
    if (ids.length) setSelectedIds(ids)
  }, [mode, sessionParticipantIDs.join(",")])

  useEffect(() => {
    if (currentAssistant?.id) setSelectedId((current) => current ?? currentAssistant.id)
  }, [currentAssistant?.id])

  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
  const filteredAssistants = useMemo(() => {
    if (!normalizedQuery) return assistants
    return assistants.filter((assistant) =>
      [
        assistantName(assistant),
        assistant.character?.name,
        assistantSignature(assistant),
        assistantSummary(assistant),
        assistant.character?.description,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("zh-CN").includes(normalizedQuery)),
    )
  }, [assistants, normalizedQuery])
  const selectedAssistant =
    assistants.find((assistant) => assistant.id === selectedId) ??
    assistants.find((assistant) => assistant.id === currentAssistant?.id) ??
    assistants.find((assistant) => assistant.is_default) ??
    assistants[0]
  const currentAssistantId = currentAssistant?.id ?? assistants.find((assistant) => assistant.is_default)?.id
  const selectedIsCurrent = Boolean(selectedAssistant && currentAssistantId === selectedAssistant.id)
  const selectedStandeeUrl = selectedAssistant ? standeeUrl(selectedAssistant) : undefined

  async function handleSwitch() {
    if (!selectedAssistant || selectedIsCurrent || switchingId) return
    const token = getStoredToken()
    if (!token) {
      setError("登录状态已失效，请重新登录。")
      return
    }
    setSwitchingId(selectedAssistant.id)
    setError(undefined)
    setNotice(undefined)
    try {
      const updated = await setCurrentAssistant(token, selectedAssistant.id)
      const nextAssistant: CoreAssistant = {
        ...selectedAssistant,
        ...updated,
        character: updated.character ?? selectedAssistant.character,
      }
      setAssistants((items) =>
        items.map((item) => (item.id === nextAssistant.id ? nextAssistant : item)),
      )
      onAssistantChanged(nextAssistant)
      setNotice(`已切换到${assistantName(nextAssistant)}，当前会话历史保持不变。`)
    } catch (switchError) {
      setError(getErrorMessage(switchError, "切换助手失败。"))
    } finally {
      setSwitchingId(undefined)
    }
  }

  async function handleSaveParticipants() {
    if (!selectedIds.length || switchingId) return
    setSwitchingId(selectedAssistant?.id ?? selectedIds[0])
    setError(undefined)
    try {
      await onParticipantsChanged?.(selectedIds)
      setNotice(`已保存 ${selectedIds.length} 位会话参与者。导演会按每轮内容决定由谁回复。`)
    } catch (saveError) {
      setError(getErrorMessage(saveError, "保存会话参与者失败。"))
    } finally {
      setSwitchingId(undefined)
    }
  }

  return (
    <motion.div
      key="assistant-switcher"
      {...pageMotion}
      transition={transition}
      className="fixed inset-0 z-20 flex h-[100vh] w-[100vw] flex-col overflow-hidden bg-[#fbfaf7] font-sans text-[#2d2926]"
    >
      <img
        src={paperTexture}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.045]"
        draggable={false}
      />
      <div className="relative z-10 flex min-h-0 flex-1">
      <aside className="flex h-full w-[28vw] min-w-[270px] max-w-[34vw] flex-none flex-col border-r border-[#e2ddd7] bg-[#fffefa]/84 backdrop-blur-[2px]">
        <div className="shrink-0 px-[2.15vw] pb-[1.7vh] pt-[3.2vh]">
          <div className="flex items-center gap-[1.15vw]">
            <button
              type="button"
              onClick={onBack}
              className="flex h-[4.7vh] w-[4.7vh] items-center justify-center rounded-[0.65vh] text-[#6f6a65] outline-none transition-colors hover:bg-[#f5efe7] hover:text-[#2d2926] focus-visible:ring-2 focus-visible:ring-accent/45"
              aria-label="返回"
            >
              <ArrowLeft className="h-[2.65vh] w-[2.65vh]" strokeWidth={1.8} />
            </button>
            <h1 className="font-serif text-[3.05vh] font-medium tracking-[-0.02em]">
              {mode === "participants" ? "会话参与者" : "切换助手"}
            </h1>
          </div>
          <label className="mt-[2.2vh] flex h-[4.9vh] items-center gap-[0.7vw] rounded-[0.7vh] border border-[#ddd7d0] bg-white/75 px-[1vw] text-[#8d857e] transition-colors focus-within:border-accent/60 focus-within:bg-white focus-within:ring-2 focus-within:ring-accent/10">
            <Search className="h-[2vh] w-[2vh] shrink-0" strokeWidth={1.8} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索助手名称或描述"
              className="min-w-0 flex-1 bg-transparent text-[1.48vh] text-[#3e3935] outline-none placeholder:text-[#aaa39c]"
              aria-label="搜索助手"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[1.45vw] pb-[2vh]">
          {loading ? (
            <div className="flex h-[28vh] items-center justify-center gap-[0.8vw] text-[1.5vh] text-[#8a8179]">
              <LoaderCircle className="h-[2.2vh] w-[2.2vh] animate-spin text-accent" />
              正在读取助手名册…
            </div>
          ) : filteredAssistants.length === 0 ? (
            <div className="px-[1vw] py-[5vh] text-center text-[1.5vh] leading-relaxed text-[#8a8179]">
              没有找到匹配的助手
            </div>
          ) : (
            <section aria-labelledby="all-assistants-title">
              <h2 id="all-assistants-title" className="px-[0.8vw] pb-[0.8vh] text-[1.72vh] font-medium text-[#777069]">
                全部助手
              </h2>
              <div role="listbox" aria-label="全部助手" className="overflow-hidden rounded-[0.55vh]">
                {filteredAssistants.map((assistant) => (
                  <AssistantRow
                    key={`all-${assistant.id}`}
                    assistant={assistant}
                    selected={assistant.id === selectedAssistant?.id}
                    current={assistant.id === currentAssistantId}
                    multi={mode === "participants"}
                    checked={selectedIds.includes(assistant.id)}
                    onSelect={() => {
                      setSelectedId(assistant.id)
                      if (mode === "participants") {
                        setSelectedIds((current) =>
                          current.includes(assistant.id)
                            ? current.length > 1 ? current.filter((id) => id !== assistant.id) : current
                            : [...current, assistant.id],
                        )
                      }
                      setNotice(undefined)
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-hidden">
        {selectedAssistant ? (
          <div className="relative h-full">
            <section className="relative z-10 w-[500px] max-w-[46vw] pb-[5vh] pl-[3.15vw] pt-[13.2vh]">
              <h2 className="font-serif text-[4.3vh] font-semibold leading-none tracking-[-0.025em] text-[#24201e]">
                {assistantName(selectedAssistant)}
              </h2>
              <p
                className="mt-[1.7vh] max-w-[44vw] truncate text-[1.95vh] leading-[1.7] text-[#49423d]"
                title={assistantSummary(selectedAssistant)}
              >
                {assistantSummary(selectedAssistant)}
              </p>

              <dl className="mt-[4.1vh] max-w-[39vw] border-y border-[#e5dfd8]" style={{ width: 310 }}>
                <div className="grid min-h-[7.4vh] grid-cols-[2.4vh_8vw_minmax(0,1fr)] items-center gap-[1vw] border-b border-[#e5dfd8]">
                  <Smile className="h-[2.35vh] w-[2.35vh] text-[#777069]" strokeWidth={1.7} />
                  <dt className="text-[1.64vh] text-[#746d66]">角色性格</dt>
                  <dd className="truncate text-[1.7vh] text-[#4c4641]">{personalitySummary(selectedAssistant)}</dd>
                </div>
                <div className="grid min-h-[7.4vh] grid-cols-[2.4vh_8vw_minmax(0,1fr)] items-center gap-[1vw] border-b border-[#e5dfd8]">
                  <Sparkles className="h-[2.35vh] w-[2.35vh] text-[#777069]" strokeWidth={1.7} />
                  <dt className="text-[1.64vh] text-[#746d66]">当前模型</dt>
                  <dd className="truncate text-[1.7vh] text-[#4c4641]">{modelLabel(selectedAssistant)}</dd>
                </div>
                <div className="grid min-h-[8.3vh] grid-cols-[2.4vh_8vw_minmax(0,1fr)] items-center gap-[1vw]">
                  <BriefcaseBusiness className="h-[2.35vh] w-[2.35vh] text-[#777069]" strokeWidth={1.7} />
                  <dt className="text-[1.64vh] text-[#746d66]">可用能力</dt>
                  <dd className="flex items-center gap-[0.65vw]">
                    {[
                      { label: "文件", icon: FileText },
                      { label: "终端", icon: SquareTerminal },
                      { label: "自醒", icon: Sparkles },
                    ].map((capability) => {
                      const Icon = capability.icon
                      return (
                        <span
                          key={capability.label}
                          className="flex h-[4.1vh] items-center gap-[0.42vw] rounded-[0.55vh] border border-[#ddd7d0] bg-white/55 px-[0.75vw] text-[1.45vh] text-[#56504a]"
                        >
                          <Icon className="h-[1.85vh] w-[1.85vh]" strokeWidth={1.7} />
                          {capability.label}
                        </span>
                      )
                    })}
                  </dd>
                </div>
              </dl>

              <div
                className="mt-[3.8vh] flex max-w-[39vw] items-start gap-[0.9vw] rounded-[0.7vh] border border-[#eadbc8] bg-[#fff8ef]/78 px-[1.35vw] py-[1.65vh] text-[1.5vh] leading-[1.65] text-[#605850]"
                style={{ width: 310 }}
              >
                <Info className="mt-[0.15vh] h-[2.1vh] w-[2.1vh] shrink-0 text-[#83786d]" strokeWidth={1.7} />
                <p>
                  {mode === "participants" ? (
                    <>可同时选择多位助手。主参与者负责导演，<br />每轮只唤起适合发言的角色。</>
                  ) : (
                    <>切换助手会改变新会话的初始角色，<br />不会替代现有会话参与者。</>
                  )}
                </p>
              </div>

              <div className="mt-[5vh] flex items-center gap-[2vw]">
                <button
                  type="button"
                  onClick={mode === "participants" ? handleSaveParticipants : handleSwitch}
                  disabled={(mode === "current" ? selectedIsCurrent : !selectedIds.length) || switchingId !== undefined}
                  className={cn(
                    "flex h-[5.9vh] min-w-[11.8vw] items-center justify-center rounded-[0.62vh] px-[1.45vw] text-[1.78vh] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2",
                    mode === "current" && selectedIsCurrent
                      ? "cursor-default border border-[#e1dbd4] bg-[#f4f0eb] text-[#8b837c]"
                      : "bg-accent text-white shadow-[0_0.25vh_0.7vh_rgba(180,95,0,0.16)] hover:bg-[#c86e05] active:bg-[#b86204]",
                  )}
                >
                  {switchingId === selectedAssistant.id ? (
                    <>
                      <LoaderCircle className="mr-[0.55vw] h-[2vh] w-[2vh] animate-spin" />
                      正在切换…
                    </>
                  ) : mode === "participants" ? (
                    `保存 ${selectedIds.length} 位参与者`
                  ) : selectedIsCurrent ? (
                    "当前助手"
                  ) : (
                    `切换到${assistantName(selectedAssistant)}`
                  )}
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="group flex h-[5.3vh] items-center gap-[0.55vw] px-[0.4vw] text-[1.6vh] text-[#514a45] outline-none transition-colors hover:text-accent focus-visible:text-accent"
                >
                  查看助手设置
                  <ChevronRight className="h-[1.8vh] w-[1.8vh] transition-transform group-hover:translate-x-[0.15vw]" />
                </button>
              </div>
              <div className="mt-[1.9vh] flex items-center gap-[0.55vw] text-[1.35vh] text-[#817970]">
                <ShieldCheck className="h-[1.75vh] w-[1.75vh]" strokeWidth={1.7} />
                {mode === "participants"
                  ? `已选择 ${selectedIds.length} 位助手；历史消息会保留各自说话人身份`
                  : `新会话默认从${assistantName(selectedAssistant)}开始，不会清除历史消息`}
              </div>

              {notice ? (
                <div
                  className="mt-[2vh] max-w-[39vw] rounded-[0.6vh] border border-emerald-200 bg-emerald-50/80 px-[1vw] py-[1vh] text-[1.4vh] text-emerald-700"
                  style={{ width: 310 }}
                  role="status"
                >
                  {notice}
                </div>
              ) : null}
              {error ? (
                <div
                  className="mt-[2vh] max-w-[39vw] rounded-[0.6vh] border border-red-200 bg-red-50/80 px-[1vw] py-[1vh] text-[1.4vh] text-red-700"
                  style={{ width: 310 }}
                  role="alert"
                >
                  {error}
                </div>
              ) : null}
            </section>

            <figure className="pointer-events-none absolute bottom-[8.2vh] right-[6vw] top-[10.8vh] flex w-[24vw] items-end justify-center">
              {selectedStandeeUrl ? (
                <motion.img
                  key={`${selectedAssistant.id}:${selectedStandeeUrl}`}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={transition}
                  src={selectedStandeeUrl}
                  alt={`${assistantName(selectedAssistant)}立绘`}
                  className="h-full max-w-full object-contain object-bottom drop-shadow-[0_1.2vh_1.2vh_rgba(73,58,45,0.08)]"
                  draggable={false}
                />
              ) : (
                <div className="mb-[15vh] flex flex-col items-center gap-[1.3vh] text-[#938a82]">
                  <Bot className="h-[7vh] w-[7vh]" strokeWidth={1.3} />
                  <span className="text-[1.5vh]">尚未配置角色立绘</span>
                </div>
              )}
            </figure>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-[1.5vh] text-[#847b73]">
            {loading ? <LoaderCircle className="h-[3.4vh] w-[3.4vh] animate-spin text-accent" /> : <Bot className="h-[4.5vh] w-[4.5vh]" />}
            <p className="text-[1.7vh]">{loading ? "正在读取助手名册…" : error || "还没有可用的助手"}</p>
          </div>
        )}
      </main>
      </div>
    </motion.div>
  )
}
