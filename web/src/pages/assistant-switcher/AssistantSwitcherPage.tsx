import { pageEnterMotion } from "../../lib/page-motion"
import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  FileText,
  LoaderCircle,
  Search,
  ShieldCheck,
  Shirt,
  Smile,
  Sparkles,
  SquareTerminal,
} from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import paperTexture from "../../assets/assistant-switcher-paper.png"
import {
  costumeLayouts,
  enabledCharacterCostumes,
  resolveAssistantAppearance,
} from "../../components/character/assistant-appearance"
import { CharacterVisualRenderer } from "../../components/character/renderer"
import type { SpineLayout } from "../../components/character/renderer/spine/spine-layout"
import {
  fetchAssistant,
  fetchAssistants,
  getErrorMessage,
  getStoredToken,
  resolveCoreAssetUrl,
  setCurrentAssistant,
  updateAssistantAppearance,
  type CoreAssistant,
} from "../../lib/auth"
import { hasAssistantDetail } from "../../lib/assistant-detail"
import { cn } from "../../lib/utils"

const transition = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
} as const

interface AssistantSwitcherPageProps {
  currentAssistant?: CoreAssistant | null
  onAssistantChanged: (assistant: CoreAssistant) => void
  onBack: () => void
  mode?: "duty" | "session"
  sessionLabel?: string
  sessionParticipantIDs?: Array<number | string>
  onParticipantsChanged?: (assistantIds: number[]) => Promise<unknown> | void
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

type AssistantCharacter = NonNullable<CoreAssistant["character"]>

interface AssistantVisualPreview {
  assistant: CoreAssistant
  character?: AssistantCharacter
  hasVisual: boolean
  key: string
  costumeKey?: string
  layout: SpineLayout
}

type VisualTransitionPhase = "idle" | "leaving" | "entering"

function assistantVisualPreview(
  assistant: CoreAssistant,
  override?: { costumeId?: number | null; layout?: SpineLayout },
): AssistantVisualPreview {
  const character = assistant.character
  const staticUrl = standeeUrl(assistant)
  const appearance = resolveAssistantAppearance(assistant, override)
  const spineAsset = appearance.asset
  const hasSpine = Boolean(
    character?.visual_preference === "spine" &&
    spineAsset &&
    spineAsset.enabled !== false,
  )
  const sourceKey = hasSpine
    ? `spine:${appearance.costumeKey ?? "costume"}:${appearance.layout}:${spineAsset?.id ?? "asset"}:${spineAsset?.skeleton_url}:${spineAsset?.atlas_url}`
    : staticUrl
      ? `static:${staticUrl}`
      : "none"

  return {
    assistant,
    character,
    hasVisual: Boolean(character && (hasSpine || staticUrl)),
    key: `${assistant.id}:${sourceKey}`,
    costumeKey: appearance.costumeKey,
    layout: appearance.layout,
  }
}

function modelLabel(assistant: CoreAssistant) {
  return cleanText(assistant.character?.ai_talk_entity_name) || "跟随角色配置"
}

function AssistantAvatar({ assistant, className }: { assistant: CoreAssistant; className?: string }) {
  const src = avatarUrl(assistant)
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card text-accent",
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
  badge,
  onSelect,
  onToggleParticipant,
  checked = false,
  lastParticipant = false,
  disabled,
}: {
  assistant: CoreAssistant
  selected: boolean
  badge?: string
  onSelect: () => void
  onToggleParticipant?: () => void
  checked?: boolean
  lastParticipant?: boolean
  disabled: boolean
}) {
  return (
    <div className={cn("relative flex min-h-[8.8vh] items-center",
      selected ? "bg-accent-dim" : "hover:bg-surface-hover")}>
      {selected ? <span className="absolute inset-y-0 left-0 w-[0.22vw] min-w-[3px] bg-accent" /> : null}
      <button type="button" aria-pressed={selected} onClick={onSelect} disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-[1.1vw] px-[1.35vw] py-[1.15vh] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/45">
        <AssistantAvatar assistant={assistant} className="h-[6.2vh] w-[6.2vh]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-[0.65vw]">
            <span className="truncate text-[2.1vh] font-medium text-text">{assistantName(assistant)}</span>
            {badge ? (
              <span className="shrink-0 rounded-[0.35vh] bg-accent-dim px-[0.5vw] py-[0.2vh] text-[1.38vh] text-accent">
                {badge}
              </span>
            ) : null}
          </span>
          <span className="mt-[0.42vh] block truncate text-[1.65vh] text-text-muted">
            {assistantSignature(assistant)}
          </span>
        </span>
      </button>
      {onToggleParticipant ? (
        <label className="grid min-h-10 min-w-10 shrink-0 cursor-pointer place-items-center" title="参与本会话">
          <input type="checkbox" aria-label={`${assistantName(assistant)}参与本会话`} checked={checked}
            disabled={disabled || lastParticipant} onChange={onToggleParticipant} className="h-4 w-4 accent-accent" />
        </label>
      ) : null}
    </div>
  )
}

export function AssistantSwitcherPage({
  currentAssistant,
  onAssistantChanged,
  onBack,
  mode = "duty",
  sessionLabel,
  sessionParticipantIDs = [],
  onParticipantsChanged,
}: AssistantSwitcherPageProps) {
  const [assistants, setAssistants] = useState<CoreAssistant[]>([])
  const [assistantDetails, setAssistantDetails] = useState<Record<number, CoreAssistant>>(() =>
    currentAssistant && hasAssistantDetail(currentAssistant)
      ? { [currentAssistant.id]: currentAssistant }
      : {},
  )
  const [selectedId, setSelectedId] = useState(currentAssistant?.id)
  const [dutyDraft, setDutyDraft] = useState<number>()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()
  const [switchingId, setSwitchingId] = useState<number | undefined>()
  const [notice, setNotice] = useState<string | undefined>()
  const [displayedVisualKey, setDisplayedVisualKey] = useState<string>()
  const [transitionTargetKey, setTransitionTargetKey] = useState<string>()
  const [visualTransitionPhase, setVisualTransitionPhase] = useState<VisualTransitionPhase>("idle")
  const [readyVisualKeys, setReadyVisualKeys] = useState<Set<string>>(() => new Set())
  const [selectedCostumeId, setSelectedCostumeId] = useState<number>()
  const [selectedLayout, setSelectedLayout] = useState<SpineLayout>("standee")
  const [appearanceDirty, setAppearanceDirty] = useState(false)
  const [participantDraft, setParticipantDraft] = useState<number[]>()

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setError("登录状态已失效，请重新登录。")
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(assistants.length === 0)
      setError(undefined)
      try {
        const items = await fetchAssistants(token, { summary: true })
        if (cancelled) return
        const currentId = currentAssistant?.id ?? items.find((item) => item.is_default)?.id
        const ordered = [...items].sort((left, right) => Number(right.id === currentId) - Number(left.id === currentId))
        setAssistants(ordered)
        setSelectedId((current) => current ?? currentId ?? ordered[0]?.id)
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
    if (!currentAssistant || !hasAssistantDetail(currentAssistant)) return
    setAssistantDetails((current) => current[currentAssistant.id] === currentAssistant
      ? current
      : { ...current, [currentAssistant.id]: currentAssistant })
  }, [currentAssistant])

  useEffect(() => {
    if (!selectedId || hasAssistantDetail(assistantDetails[selectedId])) return
    const token = getStoredToken()
    if (!token) return
    let cancelled = false
    void fetchAssistant(token, selectedId)
      .then((assistant) => {
        if (!cancelled) {
          setAssistantDetails((current) => ({ ...current, [assistant.id]: assistant }))
        }
      })
      .catch((detailError) => {
        if (!cancelled) setError(getErrorMessage(detailError, "助手详情加载失败。"))
      })
    return () => {
      cancelled = true
    }
  }, [assistantDetails, selectedId])

  const hydratedAssistants = useMemo(() => assistants.map((assistant) => {
    const detail = assistantDetails[assistant.id]
    return detail
      ? { ...assistant, ...detail, character: detail.character ?? assistant.character }
      : assistant
  }), [assistantDetails, assistants])

  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
  const filteredAssistants = useMemo(() => {
    if (!normalizedQuery) return hydratedAssistants
    return hydratedAssistants.filter((assistant) =>
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
  }, [hydratedAssistants, normalizedQuery])
  const selectedAssistant =
    hydratedAssistants.find((assistant) => assistant.id === selectedId) ??
    hydratedAssistants.find((assistant) => assistant.id === currentAssistant?.id) ??
    hydratedAssistants.find((assistant) => assistant.is_default) ??
    hydratedAssistants[0]
  const sessionAssistantId = Number(sessionParticipantIDs[0])
  const currentAssistantId = mode === "session" && Number.isFinite(sessionAssistantId)
    ? sessionAssistantId
    : currentAssistant?.id ?? hydratedAssistants.find((assistant) => assistant.is_default)?.id
  const selectedIsCurrent = Boolean(selectedAssistant && currentAssistantId === selectedAssistant.id)
  const roster = mode === "duty"
  const dutyId = dutyDraft ?? currentAssistantId
  const dutyAssistant = hydratedAssistants.find((assistant) => assistant.id === dutyId)
  const dutyChanged = dutyAssistant !== undefined && dutyId !== currentAssistantId
  const previewingDuty = roster && dutyAssistant !== undefined && selectedAssistant?.id === dutyId
  const availableParticipants = sessionParticipantIDs.map(Number)
    .filter((id) => hydratedAssistants.some((assistant) => assistant.id === id))
  const baselineParticipants = availableParticipants.length ? availableParticipants : currentAssistantId === undefined ? [] : [currentAssistantId]
  const selectedIds = participantDraft ? [
    ...baselineParticipants.filter((id) => participantDraft.includes(id)),
    ...participantDraft.filter((id) => !baselineParticipants.includes(id)),
  ] : baselineParticipants
  const participantsChanged = Boolean(onParticipantsChanged && participantDraft?.length &&
    selectedIds.join(",") !== baselineParticipants.join(","))
  const dutyAppearance = resolveAssistantAppearance(dutyAssistant, { costumeId: selectedCostumeId, layout: selectedLayout })
  const appearanceChanged = appearanceDirty && dutyAppearance.costumeId !== undefined
  const rosterChanged = participantsChanged || dutyChanged || appearanceChanged
  const savedAppearance = resolveAssistantAppearance(selectedAssistant)
  const selectedAppearance = previewingDuty ? dutyAppearance : savedAppearance
  const selectedCostumes = enabledCharacterCostumes(selectedAssistant?.character)
  const selectedCostumeLayouts = costumeLayouts(selectedAppearance.costume)
  const showAppearanceControls = previewingDuty && selectedCostumes.some((costume) => costumeLayouts(costume).length > 0)
  const selectedPreview = selectedAssistant
    ? assistantVisualPreview(selectedAssistant, {
      costumeId: selectedAppearance.costumeId,
      layout: selectedAppearance.layout,
    })
    : undefined
  const selectedVisualLoaded = Boolean(
    selectedPreview &&
    (!selectedPreview.hasVisual || readyVisualKeys.has(selectedPreview.key)),
  )
  const selectedVisualReady = Boolean(
    selectedPreview &&
    (!selectedPreview.hasVisual || (
      displayedVisualKey === selectedPreview.key &&
      visualTransitionPhase === "idle"
    )),
  )
  const previews = hydratedAssistants.map((assistant) =>
    assistant.id === selectedAssistant?.id && selectedPreview
      ? selectedPreview
      : assistantVisualPreview(assistant),
  )
  const displayedPreview = previews.find((preview) => preview.key === displayedVisualKey)
  const transitionTargetPreview = previews.find((preview) => preview.key === transitionTargetKey)
  const visualPreviews: AssistantVisualPreview[] = []
  for (const preview of [displayedPreview, transitionTargetPreview, selectedPreview]) {
    if (!preview?.hasVisual || visualPreviews.some((item) => item.key === preview.key)) continue
    visualPreviews.push(preview)
  }

  useEffect(() => {
    if (!roster || !dutyAssistant) return
    const appearance = resolveAssistantAppearance(dutyAssistant)
    setSelectedCostumeId(appearance.costumeId)
    setSelectedLayout(appearance.layout)
    setAppearanceDirty(false)
  }, [roster, dutyAssistant?.id, dutyAssistant?.visual_costume_id, dutyAssistant?.visual_layout])

  useEffect(() => {
    if (
      !selectedPreview ||
      !selectedVisualLoaded ||
      visualTransitionPhase !== "idle" ||
      displayedVisualKey === selectedPreview.key
    ) return

    setTransitionTargetKey(selectedPreview.key)
    if (displayedVisualKey) {
      setVisualTransitionPhase("leaving")
    } else {
      setDisplayedVisualKey(selectedPreview.key)
      setVisualTransitionPhase("entering")
    }
  }, [
    displayedVisualKey,
    selectedPreview?.key,
    selectedVisualLoaded,
    visualTransitionPhase,
  ])

  useEffect(() => {
    if (
      visualTransitionPhase !== "leaving" ||
      !transitionTargetKey ||
      transitionTargetKey === selectedPreview?.key
    ) return

    setTransitionTargetKey(undefined)
    setVisualTransitionPhase("idle")
  }, [selectedPreview?.key, transitionTargetKey, visualTransitionPhase])

  useEffect(() => {
    if (visualTransitionPhase !== "leaving" || !transitionTargetKey) return
    const timer = window.setTimeout(() => {
      setDisplayedVisualKey(transitionTargetKey)
      setVisualTransitionPhase("entering")
    }, transition.duration * 1000)
    return () => window.clearTimeout(timer)
  }, [transitionTargetKey, visualTransitionPhase])

  useEffect(() => {
    if (visualTransitionPhase !== "entering") return
    const timer = window.setTimeout(() => {
      setTransitionTargetKey(undefined)
      setVisualTransitionPhase("idle")
    }, transition.duration * 1000)
    return () => window.clearTimeout(timer)
  }, [visualTransitionPhase])

  function handleVisualReady(visualKey: string) {
    setReadyVisualKeys((current) => {
      if (current.has(visualKey)) return current
      const next = new Set(current)
      next.add(visualKey)
      return next
    })
  }

  async function handleSaveRoster() {
    if (!selectedAssistant || !rosterChanged || switchingId !== undefined) return
    setSwitchingId(selectedAssistant.id)
    setError(undefined)
    setNotice(undefined)
    const saved: string[] = [], failures: string[] = []
    async function save(label: string, operation: () => Promise<void>) {
      try {
        await operation()
        saved.push(label)
      } catch (reason) {
        failures.push(`${label}保存失败。 ${getErrorMessage(reason, "请重试。")}`)
      }
    }
    const token = getStoredToken()
    const requireToken = () => {
      if (!token) throw new Error("登录状态已失效，请重新登录。")
      return token
    }
    let updatedDuty = dutyAssistant
    try {
      if (participantsChanged && onParticipantsChanged) {
        await save("参与者", async () => {
          await onParticipantsChanged(selectedIds)
          setParticipantDraft(undefined)
        })
      }
      if (dutyAssistant && appearanceChanged && dutyAppearance.costumeId !== undefined) {
        const costumeId = dutyAppearance.costumeId
        await save("外观", async () => {
          const updated = await updateAssistantAppearance(requireToken(), dutyAssistant.id, {
            visual_costume_id: costumeId,
            visual_layout: dutyAppearance.layout,
          })
          updatedDuty = rememberAssistant(dutyAssistant, updated)
          if (!dutyChanged) onAssistantChanged(updatedDuty)
          setAppearanceDirty(false)
        })
      }
      if (dutyChanged && dutyAssistant) {
        await save("值日生", async () => {
          const updated = await setCurrentAssistant(requireToken(), dutyAssistant.id)
          onAssistantChanged(rememberAssistant(updatedDuty ?? dutyAssistant, updated))
          setDutyDraft(undefined)
        })
      }
    } finally {
      setSwitchingId(undefined)
    }
    if (saved.length) setNotice(`已保存${saved.join("、")}。`)
    if (failures.length) setError(failures.join(" "))
  }

  function rememberAssistant(previous: CoreAssistant, updated: CoreAssistant) {
    const assistant = { ...previous, ...updated, character: updated.character ?? previous.character }
    setAssistants((items) => items.map((item) => item.id === assistant.id ? assistant : item))
    setAssistantDetails((items) => ({ ...items, [assistant.id]: assistant }))
    return assistant
  }

  async function handleSessionSwitch() {
    if (!onParticipantsChanged || !selectedAssistant || selectedIsCurrent || switchingId !== undefined) return
    setSwitchingId(selectedAssistant.id)
    setError(undefined)
    try {
      await onParticipantsChanged([selectedAssistant.id])
      setNotice(`已将本会话切换到${assistantName(selectedAssistant)}，聊天历史保持不变。`)
    } catch (switchError) {
      setError(getErrorMessage(switchError, "切换本会话助手失败。"))
    } finally {
      setSwitchingId(undefined)
    }
  }

  return (
    <motion.div
      key="assistant-switcher"
      {...pageEnterMotion}
      className="theme-page fixed inset-0 z-20 flex h-[100vh] w-[100vw] flex-col overflow-hidden bg-bg font-sans text-text"
    >
      <img
        src={paperTexture}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.045]"
        draggable={false}
      />
      <div className="relative z-10 flex min-h-0 flex-1">
      <aside className="flex h-full w-[28vw] min-w-[270px] max-w-[34vw] flex-none flex-col border-r border-border bg-card/84 backdrop-blur-[2px]">
        <div className="shrink-0 px-[2.15vw] pb-[1.7vh] pt-[3.2vh]">
          <div className="flex items-center gap-[1.15vw]">
            <button
              type="button"
              onClick={onBack}
              disabled={switchingId !== undefined}
              className="flex h-[4.7vh] w-[4.7vh] items-center justify-center rounded-[0.65vh] text-text-muted outline-none transition-colors hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-accent/45"
              aria-label="返回"
            >
              <ArrowLeft className="h-[2.65vh] w-[2.65vh]" strokeWidth={1.8} />
            </button>
            <h1 className="font-serif text-[3.05vh] font-medium tracking-[-0.02em]">
              {roster ? "值日生" : "切换助手"}
            </h1>
          </div>
          <label className="mt-[2.2vh] flex h-[4.9vh] items-center gap-[0.7vw] rounded-[0.7vh] border border-border bg-card/75 px-[1vw] text-text-muted transition-colors focus-within:border-accent/60 focus-within:bg-card focus-within:ring-2 focus-within:ring-accent/10">
            <Search className="h-[2vh] w-[2vh] shrink-0" strokeWidth={1.8} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索助手名称或描述"
              className="min-w-0 flex-1 bg-transparent text-[1.48vh] text-text outline-none placeholder:text-text-muted"
              aria-label="搜索助手"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[1.45vw] pb-[2vh]">
          {loading ? (
            <div className="flex h-[28vh] items-center justify-center gap-[0.8vw] text-[1.5vh] text-text-muted">
              <LoaderCircle className="h-[2.2vh] w-[2.2vh] animate-spin text-accent" />
              正在读取助手名册…
            </div>
          ) : filteredAssistants.length === 0 ? (
            <div className="px-[1vw] py-[5vh] text-center text-[1.5vh] leading-relaxed text-text-muted">
              没有找到匹配的助手
            </div>
          ) : (
            <section aria-labelledby="all-assistants-title">
              <div className="flex items-center justify-between px-[0.8vw] pb-[0.8vh] text-[1.72vh] font-medium text-text-muted">
                <h2 id="all-assistants-title" className="shrink-0">全部助手</h2>
                {roster && onParticipantsChanged && <span className="ml-2 truncate pr-1" title={sessionLabel}>参与「{sessionLabel || "当前会话"}」</span>}
              </div>
              <div className="overflow-hidden rounded-[0.55vh]">
                {filteredAssistants.map((assistant) => (
                  <AssistantRow
                    key={`all-${assistant.id}`}
                    assistant={assistant}
                    selected={assistant.id === selectedAssistant?.id}
                    badge={assistant.id === currentAssistantId ? roster ? "值日生" : "本会话助手"
                      : roster && assistant.id === dutyId ? "待设值日生" : undefined}
                    checked={selectedIds.includes(assistant.id)}
                    lastParticipant={selectedIds.length === 1 && selectedIds[0] === assistant.id}
                    disabled={switchingId !== undefined}
                    onSelect={() => setSelectedId(assistant.id)}
                    onToggleParticipant={roster && onParticipantsChanged ? () => {
                      setParticipantDraft((draft) => {
                        const current = draft ?? baselineParticipants
                        if (!current.includes(assistant.id)) return [...current, assistant.id]
                        return current.length > 1 ? current.filter((id) => id !== assistant.id) : current
                      })
                      setNotice(undefined)
                    } : undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <header className="absolute inset-x-0 top-0 z-20 flex h-[8.2vh] items-center justify-end gap-2 border-b border-border bg-card/72 px-[2.6vw] backdrop-blur-[3px]">
          {roster && selectedAssistant ? (
            <button type="button" disabled={previewingDuty || switchingId !== undefined}
              onClick={() => {
                setDutyDraft(selectedAssistant.id === currentAssistantId ? undefined : selectedAssistant.id)
                setAppearanceDirty(false)
                setNotice(undefined)
              }}
              className="flex h-[4.8vh] items-center rounded-[0.62vh] border border-border px-[1.35vw] text-[1.62vh] text-text outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent/45 disabled:text-text-muted">
              {previewingDuty ? dutyChanged ? "待设值日生" : "值日生" : "设为值日生"}
            </button>
          ) : null}
          {selectedAssistant ? (
            <button
              type="button"
              onClick={roster ? handleSaveRoster : handleSessionSwitch}
              disabled={
                (roster ? !rosterChanged : !onParticipantsChanged || selectedIsCurrent || !selectedVisualReady) ||
                switchingId !== undefined
              }
              className={cn(
                "flex h-[4.8vh] min-w-[10.5vw] items-center justify-center rounded-[0.62vh] px-[1.35vw] text-[1.62vh] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2",
                "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active disabled:cursor-default disabled:border disabled:border-border disabled:bg-bg disabled:text-text-muted",
              )}
            >
              {switchingId !== undefined ? (
                <>
                  <LoaderCircle className="mr-[0.55vw] h-[2vh] w-[2vh] animate-spin" />
                  正在保存…
                </>
              ) : roster ? (
                "保存"
              ) : !selectedVisualReady ? (
                <>
                  <LoaderCircle className="mr-[0.55vw] h-[2vh] w-[2vh] animate-spin" />
                  正在准备…
                </>
              ) : selectedIsCurrent ? (
                "本会话助手"
              ) : (
                `切换本会话 · ${assistantName(selectedAssistant)}`
              )}
            </button>
          ) : null}
        </header>
        {selectedAssistant ? (
          <div className="relative h-full">
            <section className="relative z-10 w-[560px] max-w-[48vw] pb-[5vh] pl-[4vw] pt-[13.2vh]">
              <h2 className="font-serif text-[4.8vh] font-semibold leading-none tracking-[-0.025em] text-text">
                {assistantName(selectedAssistant)}
              </h2>
              <p
                className="mt-[2vh] max-w-[46vw] truncate text-[2.15vh] leading-[1.7] text-text"
                title={assistantSignature(selectedAssistant)}
              >
                {assistantSignature(selectedAssistant)}
              </p>

              <dl className="mt-[4.6vh] max-w-[43vw] border-y border-border" style={{ width: 390 }}>
                <div className="grid min-h-[8.4vh] grid-cols-[2.75vh_9vw_minmax(0,1fr)] items-center gap-[1.15vw] border-b border-border">
                  <Smile className="h-[2.65vh] w-[2.65vh] text-text-muted" strokeWidth={1.7} />
                  <dt className="text-[1.82vh] text-text-muted">角色性格</dt>
                  <dd className="truncate text-[1.9vh] text-text">{personalitySummary(selectedAssistant)}</dd>
                </div>
                <div className="grid min-h-[8.4vh] grid-cols-[2.75vh_9vw_minmax(0,1fr)] items-center gap-[1.15vw] border-b border-border">
                  <Sparkles className="h-[2.65vh] w-[2.65vh] text-text-muted" strokeWidth={1.7} />
                  <dt className="text-[1.82vh] text-text-muted">当前模型</dt>
                  <dd className="truncate text-[1.9vh] text-text">{modelLabel(selectedAssistant)}</dd>
                </div>
                <div className="grid min-h-[9.4vh] grid-cols-[2.75vh_9vw_minmax(0,1fr)] items-center gap-[1.15vw]">
                  <BriefcaseBusiness className="h-[2.65vh] w-[2.65vh] text-text-muted" strokeWidth={1.7} />
                  <dt className="text-[1.82vh] text-text-muted">可用能力</dt>
                  <dd className="flex items-center gap-[0.75vw]">
                    {[
                      { label: "文件", icon: FileText },
                      { label: "终端", icon: SquareTerminal },
                      { label: "自醒", icon: Sparkles },
                    ].map((capability) => {
                      const Icon = capability.icon
                      return (
                        <span
                          key={capability.label}
                          className="flex h-[4.7vh] items-center gap-[0.5vw] rounded-[0.65vh] border border-border bg-card/55 px-[0.9vw] text-[1.62vh] text-text"
                        >
                          <Icon className="h-[2.05vh] w-[2.05vh]" strokeWidth={1.7} />
                          {capability.label}
                        </span>
                      )
                    })}
                  </dd>
                </div>
              </dl>

              {showAppearanceControls ? (
                <section className="mt-[3.2vh] w-[34vw] max-w-[560px]" aria-labelledby="appearance-settings-title">
                  <div className="flex items-center justify-between">
                    <h3 id="appearance-settings-title" className="flex items-center gap-[0.55vw] text-[1.72vh] font-medium text-text">
                      <Shirt className="h-[2vh] w-[2vh] text-text-muted" strokeWidth={1.7} />
                      外观设置
                    </h3>
                    <span className="text-[1.35vh] text-text-muted">
                      当前：{selectedAppearance.costume?.name ?? "默认服装"} · {selectedAppearance.layout === "memory-lobby" ? "记忆大厅" : "普通立绘"}
                    </span>
                  </div>

                  <div className="mt-[1.2vh] grid grid-cols-2 gap-[1vw]">
                    <label className="grid gap-[0.55vh] text-[1.42vh] text-text-muted">
                      服装
                      <select
                        value={String(selectedAppearance.costumeId ?? "")}
                        disabled={switchingId !== undefined}
                        onChange={(event) => {
                          const costume = selectedCostumes.find((item) => String(item.id) === event.currentTarget.value)
                          if (!costume) return
                          const next = resolveAssistantAppearance(selectedAssistant, {
                            costumeId: costume.id,
                            layout: selectedLayout,
                          })
                          setSelectedCostumeId(next.costumeId)
                          setSelectedLayout(next.layout)
                          setAppearanceDirty(
                            next.costumeId !== savedAppearance.costumeId || next.layout !== savedAppearance.layout,
                          )
                          setNotice(undefined)
                        }}
                        className="h-[4.6vh] w-full rounded-[0.65vh] border border-border bg-card/75 px-[0.8vw] text-[1.52vh] text-text outline-none transition-colors hover:border-border focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
                        aria-label="选择服装"
                      >
                        {selectedCostumes.map((costume) => (
                          <option key={costume.id} value={String(costume.id)} disabled={costumeLayouts(costume).length === 0}>
                            {costume.name}{costumeLayouts(costume).length === 0 ? "（暂无可用资源）" : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-[0.55vh] text-[1.42vh] text-text-muted">
                      展示模式
                      <select
                        value={selectedAppearance.layout}
                        disabled={switchingId !== undefined}
                        onChange={(event) => {
                          const layout = event.currentTarget.value as SpineLayout
                          setSelectedLayout(layout)
                          setAppearanceDirty(
                            selectedAppearance.costumeId !== savedAppearance.costumeId || layout !== savedAppearance.layout,
                          )
                          setNotice(undefined)
                        }}
                        className="h-[4.6vh] w-full rounded-[0.65vh] border border-border bg-card/75 px-[0.8vw] text-[1.52vh] text-text outline-none transition-colors hover:border-border focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
                        aria-label="选择展示模式"
                      >
                        <option value="standee" disabled={!selectedCostumeLayouts.includes("standee")}>普通立绘</option>
                        <option value="memory-lobby" disabled={!selectedCostumeLayouts.includes("memory-lobby")}>记忆大厅</option>
                      </select>
                    </label>
                  </div>
                </section>
              ) : null}

              <div className={cn("flex items-center gap-[0.65vw] text-[1.5vh] text-text-muted", showAppearanceControls ? "mt-[2.8vh]" : "mt-[5.2vh]") }>
                <ShieldCheck className="h-[1.95vh] w-[1.95vh]" strokeWidth={1.7} />
                {roster
                  ? onParticipantsChanged
                    ? `已选 ${selectedIds.length} 位参与者 · ${selectedIds.length > 1 ? "导演模式" : "单角色"}${participantsChanged ? "（待保存）" : ""}`
                    : "打开聊天标签后可调整会话参与者"
                  : "历史消息保留原有说话人"}
              </div>

              {notice ? (
                <div
                  className="mt-[2vh] max-w-[39vw] rounded-[0.6vh] border border-success/30 bg-success-dim px-[1vw] py-[1vh] text-[1.4vh] text-success"
                  style={{ width: 310 }}
                  role="status"
                >
                  {notice}
                </div>
              ) : null}
              {error ? (
                <div
                  className="mt-[2vh] max-w-[39vw] rounded-[0.6vh] border border-danger/30 bg-danger-dim px-[1vw] py-[1vh] text-[1.4vh] text-danger"
                  style={{ width: 310 }}
                  role="alert"
                >
                  {error}
                </div>
              ) : null}
            </section>

            <figure className="pointer-events-none absolute bottom-[8.2vh] right-[6vw] top-[10.8vh] flex w-[24vw] items-end justify-center">
              {visualPreviews.map((preview) => {
                const isDisplayed = preview.key === displayedVisualKey
                const isLeaving = isDisplayed && visualTransitionPhase === "leaving"
                const isVisible = isDisplayed && !isLeaving
                return preview.character ? (
                  <motion.div
                    key={preview.key}
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{
                      opacity: isVisible ? 1 : 0,
                      y: isVisible ? 0 : 14,
                      scale: isVisible ? 1 : 0.98,
                    }}
                    transition={transition}
                    aria-hidden={!isVisible}
                    className="absolute inset-0 h-full w-full drop-shadow-[0_1.2vh_1.2vh_color-mix(in_srgb,var(--color-scrim)_8%,transparent)]"
                    style={{ zIndex: isDisplayed ? 2 : 0 }}
                  >
                    <CharacterVisualRenderer
                      character={preview.character}
                      displayName={assistantName(preview.assistant)}
                      preferredSpineLayout={preview.layout}
                      preferredCostumeId={preview.costumeKey}
                      strictSpineSelection
                      renderQuality="preview"
                      className="relative h-full w-full"
                      onReady={() => handleVisualReady(preview.key)}
                    />
                  </motion.div>
                ) : null
              })}
              {displayedPreview && !displayedPreview.hasVisual ? (
                <motion.div
                  key={displayedPreview.key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: visualTransitionPhase === "leaving" ? 0 : 1 }}
                  transition={transition}
                  className="mb-[15vh] flex flex-col items-center gap-[1.3vh] text-text-muted"
                >
                  <Bot className="h-[7vh] w-[7vh]" strokeWidth={1.3} />
                  <span className="text-[1.5vh]">尚未配置角色立绘</span>
                </motion.div>
              ) : null}
              {!displayedVisualKey && selectedPreview?.hasVisual ? (
                <LoaderCircle className="mb-[18vh] h-[3vh] w-[3vh] animate-spin text-accent" />
              ) : null}
            </figure>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-[1.5vh] text-text-muted">
            {loading ? <LoaderCircle className="h-[3.4vh] w-[3.4vh] animate-spin text-accent" /> : <Bot className="h-[4.5vh] w-[4.5vh]" />}
            <p className="text-[1.7vh]">{loading ? "正在读取助手名册…" : error || "还没有可用的助手"}</p>
          </div>
        )}
      </main>
      </div>
    </motion.div>
  )
}
