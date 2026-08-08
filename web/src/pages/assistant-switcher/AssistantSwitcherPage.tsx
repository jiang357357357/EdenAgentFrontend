import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  Check,
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
  mode?: "default" | "session" | "participants"
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
  mode = "default",
  sessionParticipantIDs = [],
  onParticipantsChanged,
}: AssistantSwitcherPageProps) {
  const [assistants, setAssistants] = useState<CoreAssistant[]>([])
  const [assistantDetails, setAssistantDetails] = useState<Record<number, CoreAssistant>>(() =>
    currentAssistant && hasAssistantDetail(currentAssistant)
      ? { [currentAssistant.id]: currentAssistant }
      : {},
  )
  const [selectedId, setSelectedId] = useState<number | undefined>(currentAssistant?.id)
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
        const items = await fetchAssistants(token, { summary: true })
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
  const currentAssistantId = currentAssistant?.id ?? hydratedAssistants.find((assistant) => assistant.is_default)?.id
  const selectedIsCurrent = Boolean(selectedAssistant && currentAssistantId === selectedAssistant.id)
  const savedAppearance = resolveAssistantAppearance(selectedAssistant)
  const selectedAppearance = resolveAssistantAppearance(selectedAssistant, {
    costumeId: selectedCostumeId,
    layout: selectedLayout,
  })
  const selectedCostumes = enabledCharacterCostumes(selectedAssistant?.character)
  const selectedCostumeLayouts = costumeLayouts(selectedAppearance.costume)
  const showAppearanceControls = mode === "default" && selectedCostumes.some((costume) => costumeLayouts(costume).length > 0)
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
    if (!selectedAssistant) return
    const appearance = resolveAssistantAppearance(selectedAssistant)
    setSelectedCostumeId(appearance.costumeId)
    setSelectedLayout(appearance.layout)
    setAppearanceDirty(false)
  }, [selectedAssistant?.id, selectedAssistant?.visual_costume_id, selectedAssistant?.visual_layout])

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

  async function handleSwitch() {
    if (!selectedAssistant || (selectedIsCurrent && !appearanceDirty) || !selectedVisualReady || switchingId) return
    const token = getStoredToken()
    if (!token) {
      setError("登录状态已失效，请重新登录。")
      return
    }
    setSwitchingId(selectedAssistant.id)
    setError(undefined)
    setNotice(undefined)
    try {
      let appearanceAssistant = selectedAssistant
      if (appearanceDirty && selectedAppearance.costumeId) {
        appearanceAssistant = await updateAssistantAppearance(token, selectedAssistant.id, {
          visual_costume_id: selectedAppearance.costumeId,
          visual_layout: selectedAppearance.layout,
        })
      }
      const updated = selectedIsCurrent
        ? appearanceAssistant
        : await setCurrentAssistant(token, selectedAssistant.id)
      const nextAssistant: CoreAssistant = {
        ...selectedAssistant,
        ...appearanceAssistant,
        ...updated,
        character: updated.character ?? appearanceAssistant.character ?? selectedAssistant.character,
      }
      setAssistants((items) =>
        items.map((item) => (item.id === nextAssistant.id ? nextAssistant : item)),
      )
      setAssistantDetails((items) => ({ ...items, [nextAssistant.id]: nextAssistant }))
      onAssistantChanged(nextAssistant)
      setAppearanceDirty(false)
      setNotice(
        selectedIsCurrent
          ? `已应用${assistantName(nextAssistant)}的外观选择。`
          : `已应用外观并将${assistantName(nextAssistant)}设为默认助手，仅影响之后创建的新会话。`,
      )
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

  async function handleSessionSwitch() {
    if (!selectedAssistant || selectedIsCurrent || switchingId) return
    setSwitchingId(selectedAssistant.id)
    setError(undefined)
    try {
      await onParticipantsChanged?.([selectedAssistant.id])
      setSelectedIds([selectedAssistant.id])
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
        <header className="absolute inset-x-0 top-0 z-20 flex h-[8.2vh] items-center justify-end border-b border-[#e2ddd7] bg-[#fffefa]/72 px-[2.6vw] backdrop-blur-[3px]">
          {selectedAssistant ? (
            <button
              type="button"
              onClick={mode === "participants" ? handleSaveParticipants : mode === "session" ? handleSessionSwitch : handleSwitch}
              disabled={
                (mode === "participants"
                  ? !selectedIds.length
                  : (selectedIsCurrent && !appearanceDirty) || !selectedVisualReady) ||
                switchingId !== undefined
              }
              className={cn(
                "flex h-[4.8vh] min-w-[10.5vw] items-center justify-center rounded-[0.62vh] px-[1.35vw] text-[1.62vh] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2",
                mode !== "participants" && ((selectedIsCurrent && !appearanceDirty) || !selectedVisualReady)
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
              ) : !selectedVisualReady ? (
                <>
                  <LoaderCircle className="mr-[0.55vw] h-[2vh] w-[2vh] animate-spin" />
                  正在准备…
                </>
              ) : selectedIsCurrent && !appearanceDirty ? (
                mode === "default" ? "当前选择" : "本会话助手"
              ) : (
                mode === "default" ? "应用选择" : `切换本会话 · ${assistantName(selectedAssistant)}`
              )}
            </button>
          ) : null}
        </header>
        {selectedAssistant ? (
          <div className="relative h-full">
            <section className="relative z-10 w-[560px] max-w-[48vw] pb-[5vh] pl-[4vw] pt-[13.2vh]">
              <h2 className="font-serif text-[4.8vh] font-semibold leading-none tracking-[-0.025em] text-[#24201e]">
                {assistantName(selectedAssistant)}
              </h2>
              <p
                className="mt-[2vh] max-w-[46vw] truncate text-[2.15vh] leading-[1.7] text-[#49423d]"
                title={assistantSignature(selectedAssistant)}
              >
                {assistantSignature(selectedAssistant)}
              </p>

              <dl className="mt-[4.6vh] max-w-[43vw] border-y border-[#e5dfd8]" style={{ width: 390 }}>
                <div className="grid min-h-[8.4vh] grid-cols-[2.75vh_9vw_minmax(0,1fr)] items-center gap-[1.15vw] border-b border-[#e5dfd8]">
                  <Smile className="h-[2.65vh] w-[2.65vh] text-[#777069]" strokeWidth={1.7} />
                  <dt className="text-[1.82vh] text-[#746d66]">角色性格</dt>
                  <dd className="truncate text-[1.9vh] text-[#4c4641]">{personalitySummary(selectedAssistant)}</dd>
                </div>
                <div className="grid min-h-[8.4vh] grid-cols-[2.75vh_9vw_minmax(0,1fr)] items-center gap-[1.15vw] border-b border-[#e5dfd8]">
                  <Sparkles className="h-[2.65vh] w-[2.65vh] text-[#777069]" strokeWidth={1.7} />
                  <dt className="text-[1.82vh] text-[#746d66]">当前模型</dt>
                  <dd className="truncate text-[1.9vh] text-[#4c4641]">{modelLabel(selectedAssistant)}</dd>
                </div>
                <div className="grid min-h-[9.4vh] grid-cols-[2.75vh_9vw_minmax(0,1fr)] items-center gap-[1.15vw]">
                  <BriefcaseBusiness className="h-[2.65vh] w-[2.65vh] text-[#777069]" strokeWidth={1.7} />
                  <dt className="text-[1.82vh] text-[#746d66]">可用能力</dt>
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
                          className="flex h-[4.7vh] items-center gap-[0.5vw] rounded-[0.65vh] border border-[#ddd7d0] bg-white/55 px-[0.9vw] text-[1.62vh] text-[#56504a]"
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
                    <h3 id="appearance-settings-title" className="flex items-center gap-[0.55vw] text-[1.72vh] font-medium text-[#4d4742]">
                      <Shirt className="h-[2vh] w-[2vh] text-[#777069]" strokeWidth={1.7} />
                      外观设置
                    </h3>
                    <span className="text-[1.35vh] text-[#958c84]">
                      当前：{selectedAppearance.costume?.name ?? "默认服装"} · {selectedAppearance.layout === "memory-lobby" ? "记忆大厅" : "普通立绘"}
                    </span>
                  </div>

                  <div className="mt-[1.2vh] flex gap-[0.75vw] overflow-x-auto pb-[0.45vh]" role="listbox" aria-label="选择服装">
                    {selectedCostumes.map((costume) => {
                      const active = costume.id === selectedAppearance.costumeId
                      const avatar = resolveCoreAssetUrl(costume.avatar_url || selectedAssistant.character?.avatar_url)
                      const layouts = costumeLayouts(costume)
                      const disabled = layouts.length === 0
                      return (
                        <button
                          key={costume.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          disabled={disabled}
                          onClick={() => {
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
                          className={cn(
                            "flex h-[7.2vh] min-w-[8.4vw] items-center gap-[0.65vw] rounded-[0.72vh] border px-[0.7vw] text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent/35",
                            active
                              ? "border-accent bg-[#fff2df] shadow-[0_0.25vh_0.7vh_rgba(180,95,0,0.1)]"
                              : "border-[#ded8d0] bg-white/55 hover:border-[#cfc6bc] hover:bg-white/80",
                            disabled && "cursor-not-allowed opacity-45",
                          )}
                        >
                          <span className="flex h-[5.2vh] w-[5.2vh] shrink-0 items-center justify-center overflow-hidden rounded-[0.55vh] bg-[#f7f2eb]">
                            {avatar ? (
                              <img src={avatar} alt="" className="h-full w-full object-cover object-top" draggable={false} />
                            ) : (
                              <Shirt className="h-[2.4vh] w-[2.4vh] text-[#9b9188]" strokeWidth={1.5} />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[1.52vh] font-medium text-[#4d4640]">{costume.name}</span>
                            <span className="mt-[0.35vh] block text-[1.18vh] text-[#948a82]">
                              {layouts.length === 2 ? "两种展示" : layouts[0] === "memory-lobby" ? "记忆大厅" : layouts[0] === "standee" ? "普通立绘" : "暂无资源"}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-[1.15vh] grid grid-cols-[8vw_minmax(0,1fr)] items-center gap-[1vw]">
                    <span className="text-[1.52vh] text-[#756e67]">展示模式</span>
                    <div className="grid h-[4.5vh] grid-cols-2 rounded-[0.65vh] border border-[#ded8d0] bg-[#f2eee8]/70 p-[0.35vh]" role="radiogroup" aria-label="选择展示模式">
                      {([
                        ["standee", "普通立绘"],
                        ["memory-lobby", "记忆大厅"],
                      ] as const).map(([layout, label]) => {
                        const available = selectedCostumeLayouts.includes(layout)
                        const active = selectedAppearance.layout === layout
                        return (
                          <button
                            key={layout}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={!available}
                            onClick={() => {
                              setSelectedLayout(layout)
                              setAppearanceDirty(
                                selectedAppearance.costumeId !== savedAppearance.costumeId || layout !== savedAppearance.layout,
                              )
                              setNotice(undefined)
                            }}
                            className={cn(
                              "rounded-[0.48vh] text-[1.45vh] font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent/35",
                              active ? "bg-white text-accent shadow-sm" : "text-[#777069] hover:text-[#4e4843]",
                              !available && "cursor-not-allowed opacity-35",
                            )}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </section>
              ) : null}

              <div className={cn("flex items-center gap-[0.65vw] text-[1.5vh] text-[#817970]", showAppearanceControls ? "mt-[2.8vh]" : "mt-[5.2vh]") }>
                <ShieldCheck className="h-[1.95vh] w-[1.95vh]" strokeWidth={1.7} />
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
                    className="absolute inset-0 h-full w-full drop-shadow-[0_1.2vh_1.2vh_rgba(73,58,45,0.08)]"
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
                  className="mb-[15vh] flex flex-col items-center gap-[1.3vh] text-[#938a82]"
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
