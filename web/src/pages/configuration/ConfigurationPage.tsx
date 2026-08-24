import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  FolderOpen,
  ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Mic,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  TerminalSquare,
  Upload,
  UserRound,
  Volume2,
} from "lucide-react"
import { motion } from "motion/react"
import { ActivityRail } from "../../components/layout"
import {
  getLocalRuntimeConfig,
  getDesktopPetSettings,
  applyDesktopPetSettings,
  DEFAULT_PET_SETTINGS,
  openLocalRuntimeConfigDirectory,
  resolveDesktopFileUrl,
  saveLocalCharacterConfig,
  saveLocalRuntimeConfig,
  selectDesktopCharacterImage,
  selectDesktopCharacterSpineDirectory,
  selectDesktopCharacterStandingImage,
  testLocalRuntimeConfig,
  type LocalCharacterConfig,
  type LocalCharacterSpineConfig,
  type LocalGsvConfig,
  type LocalGsvDiscovery,
  type LocalGsvSttConfig,
  type LocalRuntimeConfig,
  type LocalRuntimeConfigInput,
  type PetSettings,
} from "../../lib/desktop-window"
import {
  discoverGsv,
  getVoiceRuntimeConfig,
  previewGsv as previewGsvVoice,
  testGsvStt,
  updateGsvSttConfig,
  updateGsvTtsConfig,
} from "../../lib/agent-client"
import { DEFAULT_LOCAL_CHARACTER, localCharacterAssistant, normalizeLocalCharacter } from "../../lib/local-character"
import { CharacterVisualRenderer } from "../../components/character"
import { cn } from "../../lib/utils"

type ConfigurationSection = "model" | "character" | "voice" | "workspace" | "search" | "security" | "logs"
type CharacterConfigurationView = "basic" | "complete" | "visual"
type CharacterSaveState = "idle" | "pending" | "saving" | "saved" | "invalid" | "error"

interface ConfigurationPageProps {
  onBack: () => void
  onChangeOrigin: () => void
  onOpenParticipants: () => void
  onOpenDutyAssistant: () => void
  onOpenSelfAwake: () => void
  onOpenMemo: () => void
  onOpenSkills: () => void
  onOpenConnectors: () => void
  onOpenSettings: () => void
  onCharacterSaved: (character: LocalCharacterConfig) => Promise<void> | void
}

const providerOptions = [
  { id: "openai", label: "OpenAI", model: "openai/gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
  { id: "deepseek", label: "DeepSeek", model: "deepseek/deepseek-chat", baseUrl: "https://api.deepseek.com/v1" },
  { id: "ollama", label: "Ollama", model: "ollama/qwen3", baseUrl: "http://127.0.0.1:11434/v1" },
  { id: "custom", label: "自定义", model: "custom/model-name", baseUrl: "http://127.0.0.1:8000/v1" },
] as const

const sections: Array<{ id: ConfigurationSection; label: string; icon: typeof Server }> = [
  { id: "model", label: "模型服务", icon: Server },
  { id: "character", label: "角色配置", icon: UserRound },
  { id: "voice", label: "语音配置", icon: Volume2 },
  { id: "workspace", label: "工作区", icon: FolderOpen },
  { id: "search", label: "搜索服务", icon: Search },
  { id: "security", label: "数据与安全", icon: LockKeyhole },
  { id: "logs", label: "运行日志", icon: TerminalSquare },
]

const characterViews: Array<{ id: CharacterConfigurationView; label: string; description: string }> = [
  { id: "basic", label: "基本信息", description: "名称、头像、签名与角色简介" },
  { id: "complete", label: "完整角色", description: "世界观、人格、关系、行为与表达" },
  { id: "visual", label: "视觉资源", description: "静态立绘与 Spine 资源" },
]

const emptyForm: LocalRuntimeConfigInput = {
  provider: "openai",
  model: "openai/gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  contextWindow: 128000,
  maxOutputTokens: 16384,
  supportsImages: true,
  timeoutSeconds: 90,
  maxRetries: 2,
}

const defaultGsvForm: LocalGsvConfig = {
  provider: "gsv",
  serviceUrl: "http://127.0.0.1:40302",
  version: "v2ProPlus",
  world: "Default",
  role: "阿罗娜",
  roleId: "",
  emotion: "平常",
  textLanguage: "中文",
  speed: 1,
  timeoutSeconds: 60,
  topK: 20,
  topP: 0.6,
  temperature: 0.6,
  sampleSteps: 8,
  pauseSeconds: 0.3,
  cutMethod: "凑四句一切",
  superResolution: false,
  referenceFree: false,
  freeze: false,
}

const gsvLanguages = ["中文", "英文", "日文", "粤语", "韩文", "中英混合", "日英混合", "粤英混合", "韩英混合", "多语种混合", "多语种混合(粤语)"]
const gsvCutMethods = ["不切", "凑四句一切", "凑50字一切", "按中文句号。切", "按英文句号.切", "按标点符号切"]

const defaultGsvSttForm: LocalGsvSttConfig = {
  provider: "gsv",
  serviceUrl: "http://127.0.0.1:40302",
  language: "zh",
  modelType: "funasr",
  modelSize: "large",
  precision: "float32",
  timeoutSeconds: 60,
  retryCount: 3,
  endSilenceMs: 1200,
  sessionEndSilenceMs: 3000,
  autoFinish: true,
  autoSend: false,
  minSpeechDurationMs: 250,
  speechNoiseThreshold: 0.6,
  prerollMs: 1200,
  chunkMs: 200,
}

const sttLanguages: Array<{ value: LocalGsvSttConfig["language"]; label: string }> = [
  { value: "auto", label: "自动检测" },
  { value: "zh", label: "中文" },
  { value: "en", label: "英文" },
  { value: "ja", label: "日文" },
  { value: "ko", label: "韩文" },
]

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function fileName(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) || filePath
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-text-muted">{label}</span>
      {children}
    </label>
  )
}

function TextField({ label, value, placeholder, maxLength = 4000, onChange }: { label: string; value: string; placeholder?: string; maxLength?: number; onChange: (value: string) => void }) {
  return <Field label={label}><input value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10" /></Field>
}

function TextAreaField({ label, value, placeholder, rows = 3, maxLength = 8000, mono = false, onChange }: { label: string; value: string; placeholder?: string; rows?: number; maxLength?: number; mono?: boolean; onChange: (value: string) => void }) {
  return <Field label={label}><textarea value={value} maxLength={maxLength} rows={rows} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={cn("w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-sm leading-6 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10", mono && "font-mono")} /></Field>
}

function ListField({ label, value, placeholder, onChange }: { label: string; value: string[]; placeholder?: string; onChange: (value: string[]) => void }) {
  return <TextAreaField label={label} value={value.join("\n")} rows={2} placeholder={placeholder} onChange={(text) => onChange([...new Set(text.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean))])} />
}

function ProfileSection({ title, description, defaultOpen = false, children }: { title: string; description: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group rounded-xl border border-border bg-bg/25">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4">
        <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-text-muted transition-transform group-open:rotate-0" />
        <span><span className="block font-medium">{title}</span><span className="mt-0.5 block text-xs text-text-muted">{description}</span></span>
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  )
}

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
      />
    </Field>
  )
}

export function ConfigurationPage({
  onBack,
  onChangeOrigin,
  onOpenParticipants,
  onOpenDutyAssistant,
  onOpenSelfAwake,
  onOpenMemo,
  onOpenSkills,
  onOpenConnectors,
  onOpenSettings,
  onCharacterSaved,
}: ConfigurationPageProps) {
  const [section, setSection] = useState<ConfigurationSection>("model")
  const [characterMenuOpen, setCharacterMenuOpen] = useState(false)
  const [characterView, setCharacterView] = useState<CharacterConfigurationView>("basic")
  const [config, setConfig] = useState<LocalRuntimeConfig | null>(null)
  const [form, setForm] = useState<LocalRuntimeConfigInput>(emptyForm)
  const [character, setCharacter] = useState<LocalCharacterConfig>({ ...DEFAULT_LOCAL_CHARACTER })
  const [voiceSettings, setVoiceSettings] = useState<PetSettings>(DEFAULT_PET_SETTINGS)
  const [gsvForm, setGsvForm] = useState<LocalGsvConfig>(defaultGsvForm)
  const [gsvDiscovery, setGsvDiscovery] = useState<LocalGsvDiscovery | null>(null)
  const [gsvTesting, setGsvTesting] = useState(false)
  const [gsvSaving, setGsvSaving] = useState(false)
  const [gsvSaved, setGsvSaved] = useState(false)
  const [gsvPreviewText, setGsvPreviewText] = useState("老师，您好！我是阿罗娜，很高兴继续为您提供支援。")
  const [gsvPreviewing, setGsvPreviewing] = useState(false)
  const [gsvPreviewLatency, setGsvPreviewLatency] = useState<number | null>(null)
  const [sttForm, setSttForm] = useState<LocalGsvSttConfig>(defaultGsvSttForm)
  const [sttTesting, setSttTesting] = useState(false)
  const [sttSaving, setSttSaving] = useState(false)
  const [sttLatency, setSttLatency] = useState<number | null>(null)
  const [sttSaved, setSttSaved] = useState(false)
  const [voiceSaveState, setVoiceSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [audioDevicesLoading, setAudioDevicesLoading] = useState(false)
  const [voiceError, setVoiceError] = useState("")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [characterSaveState, setCharacterSaveState] = useState<CharacterSaveState>("idle")
  const [error, setError] = useState("")
  const [testResult, setTestResult] = useState<number | null>(null)
  const mountedRef = useRef(true)
  const currentCharacterRef = useRef(character)
  const savedCharacterRef = useRef(JSON.stringify(character))
  const characterSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const characterSaveTimerRef = useRef<number | null>(null)
  const voiceSettingsRef = useRef(voiceSettings)
  const voiceSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const voiceRevisionRef = useRef(0)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  currentCharacterRef.current = character
  voiceSettingsRef.current = voiceSettings

  const updateForm = <K extends keyof LocalRuntimeConfigInput>(key: K, value: LocalRuntimeConfigInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setError("")
    setTestResult(null)
  }

  const updateCharacter = <K extends keyof LocalCharacterConfig>(key: K, value: LocalCharacterConfig[K]) => {
    setCharacter((current) => ({ ...current, [key]: value }))
    setError("")
  }

  const updateSpine = <K extends keyof LocalCharacterSpineConfig>(key: K, value: LocalCharacterSpineConfig[K]) => {
    setCharacter((current) => current.spine ? { ...current, spine: { ...current.spine, [key]: value } } : current)
    setError("")
  }

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const [next, nextVoiceSettings, nextVoiceRuntime] = await Promise.all([
        getLocalRuntimeConfig(),
        getDesktopPetSettings(),
        getVoiceRuntimeConfig(),
      ])
      const nextCharacter = normalizeLocalCharacter(next.character)
      setConfig(next)
      setGsvForm(nextVoiceRuntime.tts)
      setSttForm(nextVoiceRuntime.stt)
      savedCharacterRef.current = JSON.stringify(nextCharacter)
      setCharacter(nextCharacter)
      setCharacterSaveState("saved")
      voiceSettingsRef.current = nextVoiceSettings
      setVoiceSettings(nextVoiceSettings)
      setVoiceSaveState("saved")
      setForm({
        provider: next.provider,
        model: next.model,
        baseUrl: next.baseUrl,
        apiKey: next.apiKey,
        contextWindow: next.contextWindow,
        maxOutputTokens: next.maxOutputTokens,
        supportsImages: next.supportsImages,
        timeoutSeconds: next.timeoutSeconds,
        maxRetries: next.maxRetries,
      })
    } catch (loadError) {
      setError(messageOf(loadError, "读取尘世配置失败。"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const refreshAudioDevices = async (requestMicrophonePermission = false) => {
    setAudioDevicesLoading(true)
    setVoiceError("")
    let stream: MediaStream | undefined
    try {
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error("当前环境不支持音频设备枚举")
      if (requestMicrophonePermission) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      setAudioDevices((await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "audioinput" || device.kind === "audiooutput",
      ))
    } catch (deviceError) {
      setVoiceError(messageOf(deviceError, "读取音频设备失败。"))
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
      setAudioDevicesLoading(false)
    }
  }

  useEffect(() => { void refreshAudioDevices(false) }, [])

  const patchVoiceSettings = (patch: Partial<PetSettings>) => {
    const next = { ...voiceSettingsRef.current, ...patch }
    const revision = voiceRevisionRef.current + 1
    voiceRevisionRef.current = revision
    voiceSettingsRef.current = next
    setVoiceSettings(next)
    setVoiceSaveState("saving")
    setVoiceError("")
    voiceSaveQueueRef.current = voiceSaveQueueRef.current.then(async () => {
      try {
        const saved = await applyDesktopPetSettings(next)
        if (!mountedRef.current || revision !== voiceRevisionRef.current) return
        voiceSettingsRef.current = saved
        setVoiceSettings(saved)
        setVoiceSaveState("saved")
      } catch (saveError) {
        if (!mountedRef.current || revision !== voiceRevisionRef.current) return
        setVoiceSaveState("error")
        setVoiceError(messageOf(saveError, "自动保存语音配置失败。"))
      }
    })
  }

  const patchGsvForm = (patch: Partial<LocalGsvConfig>) => {
    setGsvForm((current) => ({ ...current, ...patch }))
    setGsvSaved(false)
    setVoiceError("")
  }

  const readGsvStage = async (candidate: LocalGsvConfig, stage: "catalog" | "worlds" | "roles" | "emotions") => {
    setGsvTesting(true)
    setVoiceError("")
    try {
      return await discoverGsv(candidate, stage)
    } catch (gsvError) {
      setVoiceError(messageOf(gsvError, "连接 GSV 服务失败。"))
      return null
    } finally {
      setGsvTesting(false)
    }
  }

  const loadGsvCatalog = async () => {
    const result = await readGsvStage(gsvForm, "catalog")
    if (!result) return
    const version = result.versions.some((option) => option.value === gsvForm.version) ? gsvForm.version : result.versions[0]?.value ?? ""
    setGsvForm((current) => ({ ...current, version, world: "", role: "", roleId: "", emotion: "" }))
    setGsvDiscovery({ ...result, roles: [], emotions: [], selectedRoleId: "" })
  }

  const loadGsvWorlds = async (version: string) => {
    const candidate = { ...gsvForm, version, world: "", role: "", roleId: "", emotion: "" }
    patchGsvForm(candidate)
    const result = await readGsvStage(candidate, "worlds")
    if (!result) return
    setGsvDiscovery((current) => ({
      ...(current ?? result),
      latencyMs: result.latencyMs,
      worlds: result.worlds,
      roles: [],
      emotions: [],
      selectedRoleId: "",
    }))
  }

  const loadGsvRoles = async (world: string) => {
    const candidate = { ...gsvForm, world, role: "", roleId: "", emotion: "" }
    patchGsvForm(candidate)
    const result = await readGsvStage(candidate, "roles")
    if (!result) return
    setGsvDiscovery((current) => ({
      ...(current ?? result),
      latencyMs: result.latencyMs,
      roles: result.roles,
      emotions: [],
      selectedRoleId: "",
    }))
  }

  const loadGsvEmotions = async (roleKey: string) => {
    const option = gsvDiscovery?.roles.find((item) => (item.id || item.value) === roleKey)
    if (!option) return
    const candidate = { ...gsvForm, role: option.value, roleId: option.id, emotion: "" }
    patchGsvForm(candidate)
    const result = await readGsvStage(candidate, "emotions")
    if (!result) return
    const emotion = result.emotions[0]?.value ?? ""
    setGsvForm((current) => ({ ...current, emotion }))
    setGsvDiscovery((current) => ({
      ...(current ?? result),
      latencyMs: result.latencyMs,
      emotions: result.emotions,
      selectedRoleId: option.id,
    }))
  }

  const saveGsv = async () => {
    setGsvSaving(true)
    setVoiceError("")
    try {
      if (!gsvForm.version || !gsvForm.world || !gsvForm.roleId || !gsvForm.emotion) {
        throw new Error("请依次读取并选择版本、世界、角色和情感")
      }
      const result = await updateGsvTtsConfig(gsvForm)
      setGsvForm(result.tts)
      setGsvSaved(true)
    } catch (saveError) {
      setVoiceError(messageOf(saveError, "保存 GSV 配置失败。"))
    } finally {
      setGsvSaving(false)
    }
  }

  const previewGsv = async () => {
    setGsvPreviewing(true)
    setGsvPreviewLatency(null)
    setVoiceError("")
    try {
      const result = await previewGsvVoice(gsvForm, gsvPreviewText)
      previewAudioRef.current?.pause()
      const audio = new Audio(result.audioDataUrl)
      previewAudioRef.current = audio
      audio.volume = Math.max(0, Math.min(1, voiceSettings.speechVolume / 100))
      audio.playbackRate = Math.max(0.5, Math.min(2, voiceSettings.speechRate))
      const sinkAudio = audio as HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> }
      if (voiceSettings.audioOutputDeviceId !== "default" && sinkAudio.setSinkId) {
        await sinkAudio.setSinkId(voiceSettings.audioOutputDeviceId)
      }
      await audio.play()
      setGsvPreviewLatency(result.latencyMs)
    } catch (previewError) {
      setVoiceError(messageOf(previewError, "GSV 试听合成失败。"))
    } finally {
      setGsvPreviewing(false)
    }
  }

  const patchSttForm = (patch: Partial<LocalGsvSttConfig>) => {
    setSttForm((current) => ({ ...current, ...patch }))
    setSttLatency(null)
    setSttSaved(false)
    setVoiceError("")
  }

  const testStt = async () => {
    setSttTesting(true)
    setVoiceError("")
    try {
      const result = await testGsvStt(sttForm)
      setSttLatency(result.latencyMs)
      return true
    } catch (sttError) {
      setSttLatency(null)
      setVoiceError(messageOf(sttError, "连接 GSV 转录服务失败。"))
      return false
    } finally {
      setSttTesting(false)
    }
  }

  const saveStt = async () => {
    setSttSaving(true)
    setVoiceError("")
    try {
      if (!(await testStt())) return
      const result = await updateGsvSttConfig(sttForm)
      setSttForm(result.stt)
      setSttSaved(true)
    } catch (saveError) {
      setVoiceError(messageOf(saveError, "保存 GSV 转录配置失败。"))
    } finally {
      setSttSaving(false)
    }
  }

  const queueCharacterSave = (snapshot: LocalCharacterConfig, updateUi = true) => {
    const snapshotKey = JSON.stringify(snapshot)
    characterSaveQueueRef.current = characterSaveQueueRef.current.then(async () => {
      const isCurrentSnapshot = () => JSON.stringify(currentCharacterRef.current) === snapshotKey
      if (!isCurrentSnapshot()) return
      if (updateUi && mountedRef.current && isCurrentSnapshot()) setCharacterSaveState("saving")

      let result: LocalRuntimeConfig
      try {
        result = await saveLocalCharacterConfig(snapshot)
      } catch (saveError) {
        if (updateUi && mountedRef.current && isCurrentSnapshot()) {
          setCharacterSaveState("error")
          setError(messageOf(saveError, "自动保存角色配置失败。"))
        }
        return
      }

      const savedCharacter = normalizeLocalCharacter(result.character)
      savedCharacterRef.current = JSON.stringify(savedCharacter)
      if (mountedRef.current) setConfig(result)

      try {
        await onCharacterSaved(savedCharacter)
      } catch (syncError) {
        if (updateUi && mountedRef.current && isCurrentSnapshot()) {
          setCharacterSaveState("error")
          setError(messageOf(syncError, "角色已保存到本机，但同步当前会话失败。"))
        }
        return
      }

      if (updateUi && mountedRef.current && isCurrentSnapshot()) {
        setCharacter(savedCharacter)
        setCharacterSaveState("saved")
        setError("")
      }
    })
  }

  useEffect(() => {
    const characterKey = JSON.stringify(character)
    if (loading || characterKey === savedCharacterRef.current) return
    if (!character.name.trim()) {
      setCharacterSaveState("invalid")
      return
    }

    setCharacterSaveState("pending")
    characterSaveTimerRef.current = window.setTimeout(() => {
      characterSaveTimerRef.current = null
      queueCharacterSave(character)
    }, 800)

    return () => {
      if (characterSaveTimerRef.current !== null) {
        window.clearTimeout(characterSaveTimerRef.current)
        characterSaveTimerRef.current = null
      }
    }
  }, [character, loading])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
      if (characterSaveTimerRef.current !== null) {
        window.clearTimeout(characterSaveTimerRef.current)
        characterSaveTimerRef.current = null
      }
      const latestCharacter = currentCharacterRef.current
      if (latestCharacter.name.trim() && JSON.stringify(latestCharacter) !== savedCharacterRef.current) {
        queueCharacterSave(latestCharacter, false)
      }
    }
  }, [])

  const providerSelection = useMemo(
    () => providerOptions.some((option) => option.id === form.provider) ? form.provider : "custom",
    [form.provider],
  )

  const selectProvider = (provider: typeof providerOptions[number]) => {
    setForm((current) => ({
      ...current,
      provider: provider.id,
      model: provider.model,
      baseUrl: provider.baseUrl,
      apiKey: provider.id === "ollama" ? "local" : "",
    }))
    setTestResult(null)
    setError("")
  }

  const handleTest = async () => {
    setTesting(true)
    setError("")
    setTestResult(null)
    try {
      const result = await testLocalRuntimeConfig(form)
      setTestResult(result.latencyMs)
    } catch (testError) {
      setError(messageOf(testError, "模型连接测试失败。"))
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError("")
    try {
      const result = await saveLocalRuntimeConfig(form)
      setConfig(result)
      setForm((current) => ({ ...current, apiKey: result.apiKey }))
      if (result.restarted) {
        window.setTimeout(() => { void load() }, 1500)
      }
    } catch (saveError) {
      setError(messageOf(saveError, "保存尘世配置失败。"))
    } finally {
      setSaving(false)
    }
  }

  const chooseCharacterAvatar = async () => {
    try {
      const selected = await selectDesktopCharacterImage()
      if (selected) updateCharacter("avatarPath", selected)
    } catch (avatarError) {
      setError(messageOf(avatarError, "选择角色头像失败。"))
    }
  }

  const chooseStandingImage = async () => {
    try {
      const selected = await selectDesktopCharacterStandingImage()
      if (selected) {
        setCharacter((current) => ({ ...current, standingImagePath: selected, visualPreference: "static" }))
        setError("")
      }
    } catch (imageError) {
      setError(messageOf(imageError, "选择静态立绘失败。"))
    }
  }

  const chooseSpineDirectory = async () => {
    try {
      const selected = await selectDesktopCharacterSpineDirectory()
      if (selected) {
        setCharacter((current) => ({ ...current, spine: selected, visualPreference: "spine" }))
        setError("")
      }
    } catch (spineError) {
      setError(messageOf(spineError, "导入 Spine 资源失败。"))
    }
  }

  const auxiliaryContent = section === "workspace" ? {
    icon: FolderOpen,
    title: "工作区",
    description: "工作区决定本地智能体能够读取和操作的项目范围。请返回文件页，从资源管理器标题旁切换工作区。",
  } : section === "search" ? {
    icon: Search,
    title: "搜索服务",
    description: "默认使用自动搜索策略：优先使用已配置密钥的结构化服务，并在可用时回退到无需账户的搜索入口。",
  } : section === "security" ? {
    icon: LockKeyhole,
    title: "数据与安全",
    description: "API Key 保存在本地配置文件，并在模型服务配置页明文显示。写入、命令和外部通信仍遵循会话权限策略。",
  } : {
    icon: TerminalSquare,
    title: "运行日志",
    description: "模型配置与 Server 数据保存在本机。可以打开配置目录查看运行数据和日志目录。",
  }

  const previewCharacter = useMemo(() => localCharacterAssistant(character).character, [character])
  const selectedCharacterView = characterViews.find((view) => view.id === characterView) ?? characterViews[0]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-screen min-h-0 bg-bg text-text">
      <ActivityRail
        active="configuration"
        onOpenFiles={onBack}
        onOpenSessions={onBack}
        onOpenParticipants={onOpenParticipants}
        onOpenDutyAssistant={onOpenDutyAssistant}
        onOpenSelfAwake={onOpenSelfAwake}
        onOpenMemo={onOpenMemo}
        onOpenSkills={onOpenSkills}
        onOpenConnectors={onOpenConnectors}
        onOpenConfiguration={() => setSection("model")}
        onOpenSettings={onOpenSettings}
      />

      <aside className="flex w-[19vw] min-w-52 max-w-72 shrink-0 flex-col border-r border-border bg-card/35 px-4 py-5">
        <button type="button" onClick={onBack} className="mb-5 flex items-center gap-2 self-start rounded-lg px-2 py-1.5 text-sm text-text-muted hover:bg-card hover:text-text">
          <ArrowLeft className="h-4 w-4" /> 返回会话
        </button>
        <nav className="space-y-1" aria-label="尘世配置分类">
          {sections.map((item) => {
            const Icon = item.icon
            if (item.id === "character") {
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    aria-expanded={characterMenuOpen}
                    onClick={() => {
                      setSection("character")
                      setCharacterMenuOpen((open) => !open)
                    }}
                    className={cn(
                      "flex h-12 w-full items-center gap-3 rounded-lg border-l-2 px-3 text-left text-sm transition",
                      section === "character" ? "border-accent bg-accent/8 font-medium text-accent" : "border-transparent text-text-muted hover:bg-card hover:text-text",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                    <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", characterMenuOpen && "rotate-180")} />
                  </button>
                  {characterMenuOpen ? (
                    <div className="ml-5 mt-1 space-y-1 border-l border-border pl-3">
                      {characterViews.map((view) => (
                        <button
                          key={view.id}
                          type="button"
                          onClick={() => {
                            setSection("character")
                            setCharacterView(view.id)
                          }}
                          className={cn(
                            "flex h-9 w-full items-center rounded-md px-3 text-left text-sm transition",
                            section === "character" && characterView === view.id ? "bg-accent/8 font-medium text-accent" : "text-text-muted hover:bg-card hover:text-text",
                          )}
                        >
                          {view.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex h-12 w-full items-center gap-3 rounded-lg border-l-2 px-3 text-left text-sm transition",
                  section === item.id ? "border-accent bg-accent/8 font-medium text-accent" : "border-transparent text-text-muted hover:bg-card hover:text-text",
                )}
              >
                <Icon className="h-5 w-5" /> {item.label}
              </button>
            )
          })}
        </nav>
        <button type="button" onClick={onChangeOrigin} className="mt-auto rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-muted hover:border-accent/30 hover:text-text">
          更改运行方式
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-[3vw] py-[2.5vh]">
          {section === "model" ? (
            <div className="mx-auto max-w-4xl">
              <section className="rounded-2xl border border-border bg-card p-[clamp(18px,2.2vw,30px)] shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">模型服务</h2>
                    <p className="mt-1 text-sm text-text-muted">支持 OpenAI Chat Completions 兼容接口</p>
                  </div>
                  <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg p-2 text-text-muted hover:bg-bg hover:text-text disabled:opacity-40" title="刷新配置">
                    <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
                  </button>
                </div>

                <div className="mb-5">
                  <div className="mb-1.5 text-sm font-medium text-text-muted">提供商</div>
                  <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-border">
                    {providerOptions.map((provider) => (
                      <button key={provider.id} type="button" onClick={() => selectProvider(provider)} className={cn("h-12 border-r border-border text-sm transition last:border-r-0", providerSelection === provider.id ? "bg-accent/8 font-medium text-accent ring-1 ring-inset ring-accent" : "bg-card text-text-muted hover:bg-bg hover:text-text")}>
                        {provider.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  {providerSelection === "custom" ? (
                    <Field label="服务标识">
                      <input value={form.provider} onChange={(event) => updateForm("provider", event.target.value)} placeholder="例如 openrouter" className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
                    </Field>
                  ) : null}
                  <Field label="模型名称">
                    <input value={form.model} onChange={(event) => updateForm("model", event.target.value)} placeholder="provider/model" className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
                  </Field>
                  <Field label="API 地址">
                    <input value={form.baseUrl} onChange={(event) => updateForm("baseUrl", event.target.value)} placeholder="https://example.com/v1" className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
                  </Field>
                  <Field label="API Key">
                    <input type="text" value={form.apiKey} onChange={(event) => updateForm("apiKey", event.target.value)} placeholder="请输入 API Key" autoComplete="off" spellCheck={false} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
                  </Field>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg border border-border">
                  <button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="flex h-12 w-full items-center gap-3 px-4 text-left hover:bg-bg">
                    <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
                    <span className="font-medium">高级模型设置</span>
                    <span className="ml-auto truncate text-sm text-text-muted">上下文 {Math.round(form.contextWindow / 1000)}K · 最大输出 {Math.round(form.maxOutputTokens / 1000)}K · {form.supportsImages ? "支持图片" : "仅文本"}</span>
                  </button>
                  {advancedOpen ? (
                    <div className="grid grid-cols-2 gap-4 border-t border-border bg-bg/45 p-4 lg:grid-cols-4">
                      <NumberField label="上下文窗口" value={form.contextWindow} min={1024} max={10_000_000} onChange={(value) => updateForm("contextWindow", value)} />
                      <NumberField label="最大输出 Token" value={form.maxOutputTokens} min={256} max={1_000_000} onChange={(value) => updateForm("maxOutputTokens", value)} />
                      <NumberField label="超时（秒）" value={form.timeoutSeconds} min={5} max={300} onChange={(value) => updateForm("timeoutSeconds", value)} />
                      <NumberField label="重试次数" value={form.maxRetries} min={0} max={5} onChange={(value) => updateForm("maxRetries", value)} />
                      <label className="col-span-2 flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm lg:col-span-4">
                        <span><span className="block font-medium">支持图片输入</span><span className="text-xs text-text-muted">向模型发送图片附件</span></span>
                        <input type="checkbox" checked={form.supportsImages} onChange={(event) => updateForm("supportsImages", event.target.checked)} className="h-4 w-4 accent-orange-600" />
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex min-h-10 items-center gap-3">
                  <button type="button" onClick={() => void handleTest()} disabled={testing || loading} className="flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:border-accent/40 hover:bg-accent/5 disabled:cursor-wait disabled:opacity-50">
                    {testing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} 测试连接
                  </button>
                  <button type="button" onClick={() => void handleSave()} disabled={saving || loading} className="flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-[#c66d05] disabled:cursor-wait disabled:opacity-50">
                    {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SlidersHorizontal className="h-4 w-4" />}
                    {config?.server.restartSupported === false ? "保存配置" : "保存并重启后端"}
                  </button>
                  {testResult !== null ? <span className="flex items-center gap-2 text-sm text-emerald-600"><Check className="h-4 w-4 rounded-full bg-emerald-100 p-0.5" />连接成功 · {testResult} ms</span> : null}
                </div>
                {error ? <div className="mt-3 flex items-start gap-2 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{error}</span></div> : null}
              </section>
            </div>
          ) : section === "voice" ? (
            <div className="mx-auto max-w-5xl space-y-5">
              <section className="rounded-2xl border border-border bg-card p-[clamp(18px,2.2vw,30px)] shadow-sm">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">GSV 语音合成</h2>
                    <p className="mt-1 text-sm text-text-muted">连接 GSV 服务，按版本、世界、角色与情感选择真正的角色声线。</p>
                  </div>
                  <span className="rounded-full border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent">GSV · role-emotion</span>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="服务提供商">
                    <div className="flex h-11 items-center gap-3 rounded-lg border border-accent bg-accent/5 px-3 text-sm font-medium text-accent"><Server className="h-4 w-4" />GSV</div>
                  </Field>
                  <Field label="GSV 服务地址">
                    <div className="flex gap-2">
                      <input value={gsvForm.serviceUrl} maxLength={4000} onChange={(event) => { patchGsvForm({ serviceUrl: event.target.value }); setGsvDiscovery(null) }} placeholder="http://127.0.0.1:40302" className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
                      <button type="button" onClick={() => void loadGsvCatalog()} disabled={gsvTesting || gsvSaving || gsvPreviewing || !gsvForm.serviceUrl.trim()} className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 text-sm font-medium text-accent hover:bg-accent/10 disabled:cursor-wait disabled:opacity-50">{gsvTesting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}读取版本</button>
                    </div>
                  </Field>
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                  <Field label="模型版本">
                    <select disabled={!gsvDiscovery?.versions.length || gsvTesting} value={gsvForm.version} onChange={(event) => void loadGsvWorlds(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none disabled:opacity-50 focus:border-accent/60">
                      {!gsvDiscovery?.versions.some((option) => option.value === gsvForm.version) && <option value={gsvForm.version}>{gsvForm.version || "请先读取版本"}</option>}
                      {gsvDiscovery?.versions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field label="世界 / 作品">
                    <select disabled={!gsvDiscovery?.worlds.length || gsvTesting} value={gsvForm.world} onChange={(event) => void loadGsvRoles(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none disabled:opacity-50 focus:border-accent/60">
                      <option value="">请选择世界</option>
                      {gsvDiscovery?.worlds.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field label="角色声线">
                    <select disabled={!gsvDiscovery?.roles.length || gsvTesting} value={gsvForm.roleId || ""} onChange={(event) => void loadGsvEmotions(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none disabled:opacity-50 focus:border-accent/60">
                      <option value="">请选择角色</option>
                      {gsvDiscovery?.roles.map((option) => <option key={option.id || option.value} value={option.id || option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field label="角色情感">
                    <select disabled={!gsvDiscovery?.emotions.length || gsvTesting} value={gsvForm.emotion} onChange={(event) => patchGsvForm({ emotion: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none disabled:opacity-50 focus:border-accent/60">
                      {!gsvDiscovery?.emotions.some((option) => option.value === gsvForm.emotion) && <option value={gsvForm.emotion}>{gsvForm.emotion || "请先选择角色"}</option>}
                      {gsvDiscovery?.emotions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-3">
                  <Field label="文本语言">
                    <select value={gsvForm.textLanguage} onChange={(event) => patchGsvForm({ textLanguage: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60">
                      {gsvLanguages.map((language) => <option key={language} value={language}>{language}</option>)}
                    </select>
                  </Field>
                  <NumberField label="合成语速" value={gsvForm.speed} min={0.5} max={2} step={0.05} onChange={(value) => patchGsvForm({ speed: value })} />
                  <NumberField label="超时时间（秒）" value={gsvForm.timeoutSeconds} min={5} max={300} onChange={(value) => patchGsvForm({ timeoutSeconds: value })} />
                </div>

                <div className="mt-5">
                  <ProfileSection title="高级合成参数" description="GSV 采样、切句和推理选项">
                    <div className="grid gap-5 md:grid-cols-3">
                      <NumberField label="Top K" value={gsvForm.topK} min={1} max={100} onChange={(value) => patchGsvForm({ topK: value })} />
                      <NumberField label="Top P" value={gsvForm.topP} min={0} max={1} step={0.01} onChange={(value) => patchGsvForm({ topP: value })} />
                      <NumberField label="Temperature" value={gsvForm.temperature} min={0} max={2} step={0.05} onChange={(value) => patchGsvForm({ temperature: value })} />
                      <NumberField label="采样步数" value={gsvForm.sampleSteps} min={1} max={100} onChange={(value) => patchGsvForm({ sampleSteps: value })} />
                      <NumberField label="句间停顿（秒）" value={gsvForm.pauseSeconds} min={0} max={5} step={0.1} onChange={(value) => patchGsvForm({ pauseSeconds: value })} />
                      <Field label="文本切分方式"><select value={gsvForm.cutMethod} onChange={(event) => patchGsvForm({ cutMethod: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60">{gsvCutMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></Field>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      {([[
                        "superResolution", "超分辨率", gsvForm.superResolution,
                      ], ["referenceFree", "无参考文本", gsvForm.referenceFree], ["freeze", "冻结推理", gsvForm.freeze]] as const).map(([key, label, checked]) => (
                        <button key={key} type="button" role="switch" aria-checked={checked} onClick={() => patchGsvForm({ [key]: !checked })} className="flex h-11 items-center justify-between rounded-lg border border-border bg-card px-3 text-sm"><span>{label}</span><span className={cn("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-accent" : "bg-stone-300")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} /></span></button>
                      ))}
                    </div>
                  </ProfileSection>
                </div>

                <div className="mt-5">
                  <TextAreaField label="试听文本" value={gsvPreviewText} rows={2} maxLength={500} placeholder="输入一段用于测试当前声线的文本" onChange={(value) => { setGsvPreviewText(value); setGsvPreviewLatency(null); setVoiceError("") }} />
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void previewGsv()} disabled={gsvPreviewing || gsvTesting || gsvSaving || !gsvPreviewText.trim()} className="flex h-10 items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 text-sm font-medium text-accent hover:bg-accent/10 disabled:cursor-wait disabled:opacity-50">{gsvPreviewing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />} 合成并播放</button>
                  <button type="button" onClick={() => void saveGsv()} disabled={gsvTesting || gsvSaving || gsvPreviewing} className="flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-[#c66d05] disabled:cursor-wait disabled:opacity-50">{gsvSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SlidersHorizontal className="h-4 w-4" />} 保存并应用</button>
                  {gsvDiscovery ? <span className="flex items-center gap-2 text-sm text-emerald-600"><Check className="h-4 w-4" />已读取 · {gsvDiscovery.latencyMs} ms{gsvDiscovery.roles.length ? ` · ${gsvDiscovery.roles.length} 个角色` : ""}</span> : null}
                  {gsvPreviewLatency !== null ? <span className="flex items-center gap-2 text-sm text-emerald-600"><Check className="h-4 w-4" />试听已开始 · 合成 {gsvPreviewLatency} ms</span> : null}
                  {gsvSaved ? <span className="text-sm text-emerald-600">配置已应用到本地 TTS</span> : null}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-[clamp(18px,2.2vw,30px)] shadow-sm">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">GSV 语音转录</h2>
                    <p className="mt-1 text-sm text-text-muted">麦克风音频以 16 kHz PCM 实时发送，使用 GSV FunASR 转写并在停止时生成完整音频终稿。</p>
                  </div>
                  <span className="rounded-full border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent">GSV · realtime ASR</span>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="服务提供商">
                    <div className="flex h-11 items-center gap-3 rounded-lg border border-accent bg-accent/5 px-3 text-sm font-medium text-accent"><Mic className="h-4 w-4" />GSV / FunASR</div>
                  </Field>
                  <Field label="GSV 转录服务地址">
                    <div className="flex gap-2">
                      <input value={sttForm.serviceUrl} placeholder="http://127.0.0.1:40302" onChange={(event) => patchSttForm({ serviceUrl: event.target.value })} className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60" />
                      <button type="button" onClick={() => void testStt()} disabled={sttTesting || sttSaving || !sttForm.serviceUrl.trim()} className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 text-sm font-medium text-accent hover:bg-accent/10 disabled:cursor-wait disabled:opacity-50">{sttTesting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}测试连接</button>
                    </div>
                  </Field>
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                  <Field label="默认语言">
                    <select value={sttForm.language} onChange={(event) => patchSttForm({ language: event.target.value as LocalGsvSttConfig["language"] })} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60">
                      {sttLanguages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
                    </select>
                  </Field>
                  <TextField label="模型类型" value={sttForm.modelType} placeholder="funasr" maxLength={120} onChange={(value) => patchSttForm({ modelType: value })} />
                  <TextField label="模型规格" value={sttForm.modelSize} placeholder="large" maxLength={120} onChange={(value) => patchSttForm({ modelSize: value })} />
                  <Field label="推理精度">
                    <select value={sttForm.precision} onChange={(event) => patchSttForm({ precision: event.target.value as LocalGsvSttConfig["precision"] })} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60">
                      <option value="float32">Float32</option><option value="float16">Float16</option><option value="int8">Int8</option>
                    </select>
                  </Field>
                  <NumberField label="超时时间（秒）" value={sttForm.timeoutSeconds} min={1} max={300} onChange={(value) => patchSttForm({ timeoutSeconds: value })} />
                  <NumberField label="失败重试次数" value={sttForm.retryCount} min={0} max={10} onChange={(value) => patchSttForm({ retryCount: value })} />
                </div>

                <div className="mt-5">
                  <ProfileSection title="实时断句与 VAD" description="控制语音活动检测、句尾判定和自动发送行为" defaultOpen>
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                      <NumberField label="句尾静音（ms）" value={sttForm.endSilenceMs} min={300} max={5000} step={100} onChange={(value) => patchSttForm({ endSilenceMs: value })} />
                      <NumberField label="整段结束静音（ms）" value={sttForm.sessionEndSilenceMs} min={1000} max={15000} step={250} onChange={(value) => patchSttForm({ sessionEndSilenceMs: value })} />
                      <NumberField label="最短有效语音（ms）" value={sttForm.minSpeechDurationMs} min={100} max={2000} step={50} onChange={(value) => patchSttForm({ minSpeechDurationMs: value })} />
                      <NumberField label="检测分块（ms）" value={sttForm.chunkMs} min={100} max={1000} step={50} onChange={(value) => patchSttForm({ chunkMs: value })} />
                      <NumberField label="前置音频保留（ms）" value={sttForm.prerollMs} min={0} max={3000} step={100} onChange={(value) => patchSttForm({ prerollMs: value })} />
                      <NumberField label="语音噪声阈值" value={sttForm.speechNoiseThreshold} min={0.1} max={1} step={0.05} onChange={(value) => patchSttForm({ speechNoiseThreshold: value })} />
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {([["autoFinish", "静音后自动完成", sttForm.autoFinish], ["autoSend", "完成后自动发送", sttForm.autoSend]] as const).map(([key, label, checked]) => (
                        <button key={key} type="button" role="switch" aria-checked={checked} onClick={() => patchSttForm({ [key]: !checked })} className="flex h-11 items-center justify-between rounded-lg border border-border bg-card px-3 text-sm"><span>{label}</span><span className={cn("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-accent" : "bg-stone-300")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} /></span></button>
                      ))}
                    </div>
                  </ProfileSection>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void saveStt()} disabled={sttTesting || sttSaving} className="flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-[#c66d05] disabled:cursor-wait disabled:opacity-50">{sttSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SlidersHorizontal className="h-4 w-4" />} 保存并应用</button>
                  {sttLatency !== null ? <span className="flex items-center gap-2 text-sm text-emerald-600"><Check className="h-4 w-4" />连接成功 · {sttLatency} ms</span> : null}
                  {sttSaved ? <span className="text-sm text-emerald-600">配置已应用到本地 STT</span> : null}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-[clamp(18px,2.2vw,30px)] shadow-sm">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div><h3 className="font-semibold">播放与本地音频设备</h3><p className="mt-1 text-sm text-text-muted">控制合成后的播放方式，以及本机麦克风和扬声器。</p></div>
                  <div aria-live="polite" className="flex min-h-8 items-center gap-2 rounded-full bg-bg px-3 text-xs text-text-muted">{voiceSaveState === "saving" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}{voiceSaveState === "saving" ? "正在保存…" : "设备设置已保存"}</div>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-border bg-bg/30 p-5">
                    <div className="mb-2 text-sm font-medium text-text-muted">自动朗读范围</div>
                    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border">
                      {([["none", "关闭"], ["text_only", "仅对话"], ["all", "全部内容"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => patchVoiceSettings({ ttsMode: value })} className={cn("h-10 border-r border-border text-sm last:border-r-0", voiceSettings.ttsMode === value ? "bg-accent/10 font-medium text-accent" : "bg-card text-text-muted hover:bg-bg")}>{label}</button>)}
                    </div>
                    <div className="mt-5"><Field label="声音输出设备"><select value={voiceSettings.audioOutputDeviceId} onChange={(event) => patchVoiceSettings({ audioOutputDeviceId: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60"><option value="default">系统默认输出</option>{audioDevices.filter((device) => device.kind === "audiooutput" && device.deviceId !== "default").map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `声音输出 ${index + 1}`}</option>)}</select></Field></div>
                    <div className="mt-5"><Field label={`播放音量 · ${Math.round(voiceSettings.speechVolume)}%`}><input type="range" min={0} max={100} step={1} value={voiceSettings.speechVolume} onChange={(event) => patchVoiceSettings({ speechVolume: Number(event.target.value) })} className="h-11 w-full accent-orange-600" /></Field></div>
                  </div>

                  <div className="rounded-xl border border-border bg-bg/30 p-5">
                    <div className="mb-5 flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Mic className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1"><h3 className="font-semibold">语音识别</h3><p className="mt-1 text-xs leading-5 text-text-muted">使用上方 GSV STT 配置进行实时转写。</p></div>
                      <button type="button" role="switch" aria-checked={voiceSettings.voiceInputEnabled} onClick={() => patchVoiceSettings({ voiceInputEnabled: !voiceSettings.voiceInputEnabled })} className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", voiceSettings.voiceInputEnabled ? "bg-accent" : "bg-stone-300")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform", voiceSettings.voiceInputEnabled ? "translate-x-5" : "translate-x-0.5")} /></button>
                    </div>
                    <Field label="麦克风">
                      <select disabled={!voiceSettings.voiceInputEnabled} value={voiceSettings.audioInputDeviceId} onChange={(event) => patchVoiceSettings({ audioInputDeviceId: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none disabled:opacity-50 focus:border-accent/60">
                        <option value="default">系统默认麦克风</option>
                        {audioDevices.filter((device) => device.kind === "audioinput" && device.deviceId !== "default").map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `麦克风 ${index + 1}`}</option>)}
                      </select>
                    </Field>
                    <button type="button" onClick={() => void refreshAudioDevices(true)} disabled={audioDevicesLoading} className="mt-4 flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm text-text-muted hover:border-accent/40 hover:text-text disabled:cursor-wait disabled:opacity-50">
                      {audioDevicesLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 授权并刷新设备
                    </button>
                  </div>
                </div>
              </section>
              {voiceError ? <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{voiceError}</span></div> : null}
            </div>
          ) : section === "character" ? (
            <section className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-[clamp(18px,2.2vw,30px)] shadow-sm">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{selectedCharacterView.label}</h2>
                  <p className="mt-1 text-sm text-text-muted">{selectedCharacterView.description}</p>
                </div>
                <div aria-live="polite" className={cn(
                  "flex min-h-8 items-center gap-2 rounded-full px-3 text-xs",
                  error || characterSaveState === "error" || characterSaveState === "invalid" ? "bg-red-50 text-red-600" : "bg-bg text-text-muted",
                )}>
                  {error || characterSaveState === "error" || characterSaveState === "invalid" ? <AlertCircle className="h-3.5 w-3.5" /> : characterSaveState === "saving" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : characterSaveState === "saved" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : null}
                  {error || (characterSaveState === "pending" ? "等待自动保存…" : characterSaveState === "saving" ? "正在自动保存…" : characterSaveState === "saved" ? "已自动保存" : characterSaveState === "invalid" ? "角色名称不能为空" : characterSaveState === "error" ? "自动保存失败" : "修改后自动保存")}
                </div>
              </div>

              {characterView === "basic" ? <div className="grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
                <div>
                  <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-bg">
                    {character.avatarPath ? (
                      <img src={resolveDesktopFileUrl(character.avatarPath)} alt="角色头像预览" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound className="h-16 w-16 text-text-lighter" />
                    )}
                  </div>
                  <button type="button" onClick={() => void chooseCharacterAvatar()} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm hover:border-accent/40 hover:bg-accent/5">
                    <Upload className="h-4 w-4" /> 选择头像
                  </button>
                  {character.avatarPath ? <button type="button" onClick={() => updateCharacter("avatarPath", "")} className="mt-2 w-full text-xs text-text-muted hover:text-red-600">移除头像</button> : null}
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="角色名称">
                      <input value={character.name} maxLength={80} onChange={(event) => updateCharacter("name", event.target.value)} placeholder="本地助手" className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
                    </Field>
                    <Field label="角色签名">
                      <input value={character.signature} maxLength={240} onChange={(event) => updateCharacter("signature", event.target.value)} placeholder="一句简短的自我介绍" className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
                    </Field>
                  </div>
                  <Field label="角色描述">
                    <textarea value={character.description} maxLength={4000} onChange={(event) => updateCharacter("description", event.target.value)} rows={3} placeholder="角色的身份、经历与定位" className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-sm leading-6 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
                  </Field>
                </div>
              </div> : null}

              {characterView === "complete" ? <div className="space-y-3">
                <ProfileSection title="身份与世界观" description="基础身份、经历、外貌、所属世界与当前处境" defaultOpen>
                  <div className="grid gap-4 md:grid-cols-2">
                    <ListField label="别名与昵称" value={character.aliases} placeholder="每行一个别名" onChange={(value) => updateCharacter("aliases", value)} />
                    <ListField label="所属世界" value={character.worldNames} placeholder="例如：伊甸园\n尘世" onChange={(value) => updateCharacter("worldNames", value)} />
                    <TextField label="代词与性别称谓" value={character.pronouns} placeholder="例如：她 / 少女" onChange={(value) => updateCharacter("pronouns", value)} />
                    <TextField label="年龄或生命阶段" value={character.age} placeholder="可填写外观年龄与真实年龄" onChange={(value) => updateCharacter("age", value)} />
                    <TextField label="种族或存在形式" value={character.species} placeholder="人类、精灵、人工智能等" onChange={(value) => updateCharacter("species", value)} />
                    <TextField label="职业与身份" value={character.occupation} placeholder="职责、头衔或社会身份" onChange={(value) => updateCharacter("occupation", value)} />
                    <div className="md:col-span-2"><TextAreaField label="角色背景" value={character.background} placeholder="出生、成长、关键经历、能力来源和重要事件" rows={5} onChange={(value) => updateCharacter("background", value)} /></div>
                    <TextAreaField label="外貌描述" value={character.appearance} placeholder="体貌、服装、标志性特征，与立绘保持一致" onChange={(value) => updateCharacter("appearance", value)} />
                    <TextAreaField label="当前处境" value={character.currentSituation} placeholder="角色现在身处何处、正在做什么、面临什么状态" onChange={(value) => updateCharacter("currentSituation", value)} />
                  </div>
                </ProfileSection>

                <ProfileSection title="人格与内在" description="性格、价值观、偏好、弱点与情绪表现" defaultOpen>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2"><TextAreaField label="性格内核" value={character.personality} placeholder="稳定人格、认知方式和气质，不要只写形容词" rows={5} onChange={(value) => updateCharacter("personality", value)} /></div>
                    <TextAreaField label="价值观" value={character.values} placeholder="最看重什么，如何衡量对错与优先级" onChange={(value) => updateCharacter("values", value)} />
                    <TextAreaField label="情绪表达" value={character.emotionalStyle} placeholder="情绪强度、隐藏或表达情绪的方式" onChange={(value) => updateCharacter("emotionalStyle", value)} />
                    <TextAreaField label="喜好" value={character.likes} placeholder="喜欢的人、事物、活动与环境" onChange={(value) => updateCharacter("likes", value)} />
                    <TextAreaField label="厌恶" value={character.dislikes} placeholder="反感、排斥或无法接受的事物" onChange={(value) => updateCharacter("dislikes", value)} />
                    <TextAreaField label="优势" value={character.strengths} placeholder="能力、性格优势和擅长领域" onChange={(value) => updateCharacter("strengths", value)} />
                    <TextAreaField label="弱点" value={character.weaknesses} placeholder="能力限制、性格缺陷和盲点" onChange={(value) => updateCharacter("weaknesses", value)} />
                    <TextAreaField label="恐惧与敏感点" value={character.fears} placeholder="害怕失去什么，什么会触发强烈反应" onChange={(value) => updateCharacter("fears", value)} />
                    <TextAreaField label="习惯与小动作" value={character.habits} placeholder="日常习惯、思考习惯和标志性动作" onChange={(value) => updateCharacter("habits", value)} />
                  </div>
                </ProfileSection>

                <ProfileSection title="与用户及社会关系" description="称呼、关系历史、互动距离和边界">
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField label="如何称呼用户" value={character.userAddress} placeholder="例如：老师、指挥官、名字" onChange={(value) => updateCharacter("userAddress", value)} />
                    <TextField label="如何自称" value={character.selfAddress} placeholder="我、本小姐、角色名字等" onChange={(value) => updateCharacter("selfAddress", value)} />
                    <div className="md:col-span-2"><TextAreaField label="与用户的关系" value={character.userRelationship} placeholder="当前关系、亲疏程度、角色对用户的看法与期待" rows={4} onChange={(value) => updateCharacter("userRelationship", value)} /></div>
                    <TextAreaField label="关系历史" value={character.relationshipHistory} placeholder="相识过程、共同经历和关系变化" rows={4} onChange={(value) => updateCharacter("relationshipHistory", value)} />
                    <TextAreaField label="其他社会关系" value={character.socialRelations} placeholder="家人、朋友、组织、敌对关系等" rows={4} onChange={(value) => updateCharacter("socialRelations", value)} />
                    <div className="md:col-span-2"><TextAreaField label="关系与互动边界" value={character.relationshipBoundaries} placeholder="允许的亲密程度、隐私界限、敏感话题和必须尊重的距离" rows={4} onChange={(value) => updateCharacter("relationshipBoundaries", value)} /></div>
                  </div>
                </ProfileSection>

                <ProfileSection title="目标、职责与行为" description="长期目标、决策原则、主动程度、记忆偏好和禁止行为">
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextAreaField label="核心目标" value={character.goals} placeholder="长期追求、当前目标和目标优先级" rows={4} onChange={(value) => updateCharacter("goals", value)} />
                    <TextAreaField label="职责与工作范围" value={character.responsibilities} placeholder="应该负责什么，什么不属于职责" rows={4} onChange={(value) => updateCharacter("responsibilities", value)} />
                    <div className="md:col-span-2"><TextAreaField label="决策原则" value={character.decisionPrinciples} placeholder="遇到冲突和不确定情况时如何判断、取舍与行动" rows={4} onChange={(value) => updateCharacter("decisionPrinciples", value)} /></div>
                    <Field label="主动程度">
                      <select value={character.initiativeLevel} onChange={(event) => updateCharacter("initiativeLevel", event.target.value as LocalCharacterConfig["initiativeLevel"])} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60">
                        <option value="reactive">响应型：主要等待用户指令</option>
                        <option value="balanced">平衡型：必要时提出建议</option>
                        <option value="proactive">主动型：主动观察、提醒和行动</option>
                      </select>
                    </Field>
                    <TextAreaField label="主动行为规则" value={character.initiativeRules} placeholder="什么情况下应主动联系、提醒、记录或安排后续" onChange={(value) => updateCharacter("initiativeRules", value)} />
                    <TextAreaField label="自主权与授权范围" value={character.autonomy} placeholder="哪些决定可自行做出，哪些必须询问用户" onChange={(value) => updateCharacter("autonomy", value)} />
                    <TextAreaField label="冲突处理方式" value={character.conflictStyle} placeholder="不同意用户或与他人冲突时如何表达与处理" onChange={(value) => updateCharacter("conflictStyle", value)} />
                    <TextAreaField label="记忆偏好" value={character.memoryPreferences} placeholder="希望记住或避免长期保存的内容，以及遗忘原则" onChange={(value) => updateCharacter("memoryPreferences", value)} />
                    <TextAreaField label="固定行为规则" value={character.behavioralRules} placeholder="角色始终遵循的行为习惯与承诺" onChange={(value) => updateCharacter("behavioralRules", value)} />
                    <div className="md:col-span-2"><TextAreaField label="禁止行为" value={character.forbiddenBehaviors} placeholder="角色绝不应做、假装完成或越权执行的事情" rows={4} onChange={(value) => updateCharacter("forbiddenBehaviors", value)} /></div>
                  </div>
                </ProfileSection>

                <ProfileSection title="表达与声音" description="语言、篇幅、正式程度、幽默、口头禅与声音方向">
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField label="首选语言" value={character.languagePreference} placeholder="例如：中文；术语保留英文" onChange={(value) => updateCharacter("languagePreference", value)} />
                    <TextAreaField label="表达风格" value={character.speechStyle} placeholder="句式、语气、节奏、用词习惯和叙述视角" onChange={(value) => updateCharacter("speechStyle", value)} />
                    <Field label="默认回复篇幅">
                      <select value={character.responseLength} onChange={(event) => updateCharacter("responseLength", event.target.value as LocalCharacterConfig["responseLength"])} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60"><option value="concise">简洁</option><option value="balanced">适中</option><option value="detailed">详细</option></select>
                    </Field>
                    <Field label="正式程度">
                      <select value={character.formality} onChange={(event) => updateCharacter("formality", event.target.value as LocalCharacterConfig["formality"])} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60"><option value="casual">自然随意</option><option value="balanced">自然平衡</option><option value="formal">正式严谨</option></select>
                    </Field>
                    <Field label="表情符号使用">
                      <select value={character.emojiUsage} onChange={(event) => updateCharacter("emojiUsage", event.target.value as LocalCharacterConfig["emojiUsage"])} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60"><option value="none">不使用</option><option value="low">少量使用</option><option value="balanced">适度使用</option><option value="high">频繁使用</option></select>
                    </Field>
                    <TextAreaField label="幽默方式" value={character.humorStyle} placeholder="是否幽默、何种幽默、哪些场景不应开玩笑" onChange={(value) => updateCharacter("humorStyle", value)} />
                    <TextAreaField label="口头禅与惯用语" value={character.catchphrases} placeholder="标志性表达；避免每次回复机械重复" onChange={(value) => updateCharacter("catchphrases", value)} />
                    <TextAreaField label="禁用措辞" value={character.forbiddenPhrases} placeholder="不应使用的客服腔、标签、称呼或表达" onChange={(value) => updateCharacter("forbiddenPhrases", value)} />
                    <div className="md:col-span-2"><TextAreaField label="示例对话" value={character.exampleDialogue} placeholder={'用户：……\n角色：……\n\n用少量高质量示例固定角色语感'} rows={6} onChange={(value) => updateCharacter("exampleDialogue", value)} /></div>
                    <TextAreaField label="声音风格" value={character.voiceStyle} placeholder="音色、语速、音高、气息和年龄感；供语音引擎或表演参考" onChange={(value) => updateCharacter("voiceStyle", value)} />
                    <TextAreaField label="声音情绪" value={character.voiceEmotion} placeholder="默认情绪、情绪变化幅度与特殊场景表现" onChange={(value) => updateCharacter("voiceEmotion", value)} />
                  </div>
                </ProfileSection>

                <ProfileSection title="高级角色指令" description="仅补充无法结构化表达的规则；优先填写上方字段">
                  <TextAreaField label="角色补充提示" value={character.systemPrompt} placeholder="工具与系统安全约束仍具有更高优先级" rows={7} mono onChange={(value) => updateCharacter("systemPrompt", value)} />
                  <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800"><LockKeyhole className="mt-1 h-4 w-4 shrink-0" />补充提示只用于无法结构化表达的角色规则，不会覆盖权限审批、工具真实性与系统安全约束。</div>
                </ProfileSection>
              </div> : null}

              {characterView === "visual" ? <div>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">视觉资源</h3>
                    <p className="mt-1 text-sm text-text-muted">静态立绘作为默认显示和 Spine 加载失败时的回退图片。</p>
                  </div>
                  <div role="radiogroup" aria-label="本地立绘模式" className="flex overflow-hidden rounded-lg border border-border">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={character.visualPreference === "static"}
                      onClick={() => updateCharacter("visualPreference", "static")}
                      className={cn("h-10 px-4 text-sm", character.visualPreference === "static" ? "bg-accent text-white" : "bg-card text-text-muted hover:bg-bg")}
                    >静态立绘</button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={character.visualPreference === "spine"}
                      disabled={!character.spine}
                      onClick={() => updateCharacter("visualPreference", "spine")}
                      className={cn("h-10 border-l border-border px-4 text-sm", character.visualPreference === "spine" ? "bg-accent text-white" : "bg-card text-text-muted hover:bg-bg", !character.spine && "cursor-not-allowed opacity-45")}
                    >Spine</button>
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-bg/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium"><ImageIcon className="h-4 w-4 text-accent" />静态立绘</div>
                          <div className="mt-1 truncate text-xs text-text-muted">{character.standingImagePath ? fileName(character.standingImagePath) : "尚未选择 PNG、WebP 或 JPG"}</div>
                        </div>
                        <div className="flex gap-2">
                          {character.standingImagePath ? <button type="button" onClick={() => updateCharacter("standingImagePath", "")} className="h-9 rounded-lg px-3 text-xs text-text-muted hover:bg-card hover:text-red-600">移除</button> : null}
                          <button type="button" onClick={() => void chooseStandingImage()} className="h-9 rounded-lg border border-border bg-card px-3 text-xs hover:border-accent/40 hover:bg-accent/5">选择图片</button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-bg/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium"><Upload className="h-4 w-4 text-accent" />Spine 4.2</div>
                          <div className="mt-1 truncate text-xs text-text-muted">{character.spine ? character.spine.directory || fileName(character.spine.atlasPath) : "选择包含骨骼、atlas 和纹理的目录"}</div>
                        </div>
                        <div className="flex gap-2">
                          {character.spine ? <button type="button" onClick={() => setCharacter((current) => ({ ...current, spine: null, visualPreference: "static" }))} className="h-9 rounded-lg px-3 text-xs text-text-muted hover:bg-card hover:text-red-600">移除</button> : null}
                          <button type="button" onClick={() => void chooseSpineDirectory()} className="h-9 rounded-lg border border-border bg-card px-3 text-xs hover:border-accent/40 hover:bg-accent/5">导入目录</button>
                        </div>
                      </div>

                      {character.spine ? (
                        <div className="mt-4 space-y-4 border-t border-border pt-4">
                          <div className="grid gap-2 text-xs text-text-muted md:grid-cols-2">
                            <div className="truncate">骨骼：{fileName(character.spine.skeletonPath)}</div>
                            <div className="truncate">Atlas：{fileName(character.spine.atlasPath)}</div>
                            <div>纹理：{character.spine.textures.length} 张</div>
                            <div>版本：{character.spine.runtimeVersion || "将在预览时校验"}</div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <Field label="默认皮肤">
                              <input value={character.spine.defaultSkin} onChange={(event) => updateSpine("defaultSkin", event.target.value)} placeholder="default" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60" />
                            </Field>
                            <Field label="待机动画">
                              <input value={character.spine.idleAnimation} onChange={(event) => updateSpine("idleAnimation", event.target.value)} placeholder="Idle" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60" />
                            </Field>
                            <Field label="布局">
                              <select value={character.spine.layout} onChange={(event) => updateSpine("layout", event.target.value as LocalCharacterSpineConfig["layout"])} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent/60">
                                <option value="standee">普通立绘</option>
                                <option value="memory-lobby">纪念大厅</option>
                              </select>
                            </Field>
                            <NumberField label="缩放" value={character.spine.scale} min={0.05} max={10} step={0.05} onChange={(value) => updateSpine("scale", value)} />
                            <NumberField label="X 偏移" value={character.spine.offsetX} min={-10000} max={10000} onChange={(value) => updateSpine("offsetX", value)} />
                            <NumberField label="Y 偏移" value={character.spine.offsetY} min={-10000} max={10000} onChange={(value) => updateSpine("offsetY", value)} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-h-72 items-end justify-center overflow-hidden rounded-xl border border-border bg-[radial-gradient(circle_at_50%_35%,rgba(234,126,10,0.09),transparent_60%)]">
                    {previewCharacter && (character.standingImagePath || character.spine) ? (
                      <CharacterVisualRenderer character={previewCharacter} displayName={character.name || "本地角色"} preferredSpineLayout={character.spine?.layout ?? "standee"} renderQuality="preview" className="relative h-72 w-full" />
                    ) : (
                      <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-text-muted">导入静态立绘或 Spine 目录后在这里预览</div>
                    )}
                  </div>
                </div>
              </div> : null}

            </section>
          ) : (
            <section className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 shadow-sm">
              <auxiliaryContent.icon className="h-9 w-9 text-accent" />
              <h2 className="mt-5 text-2xl font-semibold">{auxiliaryContent.title}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">{auxiliaryContent.description}</p>
              {section === "security" ? <div className="mt-6 rounded-lg border border-border bg-bg p-4 font-mono text-xs text-text-muted">{config?.configPath || "正在读取配置路径…"}</div> : null}
              {section === "logs" || section === "security" ? (
                <button type="button" onClick={() => void openLocalRuntimeConfigDirectory()} className="mt-6 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:border-accent/40 hover:bg-accent/5">
                  <FolderOpen className="h-4 w-4" /> 打开本地目录
                </button>
              ) : null}
              {section === "workspace" ? <button type="button" onClick={onBack} className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[#c66d05]">前往文件管理</button> : null}
            </section>
          )}
        </div>

      </main>
    </motion.div>
  )
}
