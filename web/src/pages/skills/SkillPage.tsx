import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Eye, FolderOpen, Github, LoaderCircle, Package, Power, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react"
import { motion } from "motion/react"
import {
  inspectSkill,
  inspectSkillUpdate,
  installSkill,
  listSkills,
  setSkillEnabled,
  uninstallSkill,
  getSkillDetails,
  type InstalledSkill,
  type SkillDetails,
  type SkillPreview,
} from "../../lib/mon_agent_api"
import { selectDesktopSkillDirectory } from "../../lib/desktop-window"

type SourceType = "local" | "git"

function readableBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function SkillRow({
  skill,
  busy,
  onToggle,
  onUninstall,
  onUpdate,
  onView,
}: {
  skill: InstalledSkill
  busy: boolean
  onToggle: () => void
  onUninstall: () => void
  onUpdate: () => void
  onView: () => void
}) {
  return (
    <article className="flex items-start gap-4 border-b border-stone-200/75 px-5 py-4 last:border-b-0">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff4e2] text-[#d87300]">
        <Package className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold text-stone-800">{skill.displayName || skill.skillName}</h3>
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">{skill.skillName}</span>
          {skill.builtin && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">内置</span>}
          {!skill.available && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-600">本地文件缺失</span>}
          {skill.shadowed && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">被项目同名技能覆盖</span>}
        </div>
        <p className="mt-1 text-[13px] leading-6 text-stone-500">{skill.description}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-400">
          <span>{skill.scope === "system" ? "系统范围" : skill.scope === "project" ? "当前项目" : "当前用户"}</span>
          <span>{skill.sourceType === "git" ? "Git" : skill.sourceType === "local" ? "本地目录" : skill.sourceType === "generated" ? "智能体创建" : "随应用提供"}</span>
          {skill.version && <span>v{skill.version}</span>}
          {skill.tools?.length ? <span>{skill.tools.length} 个工具</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!skill.builtin && (
          <button type="button" disabled={busy} onClick={onView} className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50" title="查看技能内容">
            <Eye className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          disabled={skill.builtin || busy}
          onClick={onToggle}
          className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition ${
            skill.enabled
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-stone-200 bg-white text-stone-500"
          } disabled:cursor-default disabled:opacity-60`}
          title={skill.builtin ? "内置技能始终启用" : skill.enabled ? "停用技能" : "启用技能"}
        >
          <Power className="h-3.5 w-3.5" />
          {skill.enabled ? "已启用" : "已停用"}
        </button>
        {!skill.builtin && skill.sourceType !== "generated" && (
          <button
            type="button"
            disabled={busy}
            onClick={onUpdate}
            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
            title="从原始来源检查更新"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        {!skill.builtin && (
          <button
            type="button"
            disabled={busy}
            onClick={onUninstall}
            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            title="卸载"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  )
}

export function SkillPage({ onBack }: { onBack: () => void }) {
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [busyID, setBusyID] = useState("")
  const [error, setError] = useState("")
  const [sourceType, setSourceType] = useState<SourceType>("local")
  const [sourceUri, setSourceUri] = useState("")
  const [sourceRef, setSourceRef] = useState("")
  const [sourceSubpath, setSourceSubpath] = useState("")
  const [scope, setScope] = useState<"user" | "project">("user")
  const [preview, setPreview] = useState<SkillPreview | null>(null)
  const [installOpen, setInstallOpen] = useState(false)
  const [details, setDetails] = useState<SkillDetails | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setSkills(await listSkills())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const handleChanged = () => void refresh()
    window.addEventListener("monagent:skills-changed", handleChanged)
    return () => window.removeEventListener("monagent:skills-changed", handleChanged)
  }, [refresh])

  const installedCount = useMemo(() => skills.filter((skill) => !skill.builtin).length, [skills])

  async function chooseDirectory() {
    const selected = await selectDesktopSkillDirectory()
    if (selected) setSourceUri(selected)
  }

  async function inspect() {
    setBusyID("inspect")
    setError("")
    setPreview(null)
    try {
      setPreview(await inspectSkill({ sourceType, sourceUri, sourceRef, sourceSubpath, scope }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusyID("")
    }
  }

  async function install() {
    if (!preview) return
    setBusyID("install")
    setError("")
    try {
      await installSkill(preview.previewID)
      setPreview(null)
      setInstallOpen(false)
      setSourceUri("")
      setSourceRef("")
      setSourceSubpath("")
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusyID("")
    }
  }

  async function toggle(skill: InstalledSkill) {
    setBusyID(skill.id)
    setError("")
    try {
      const updated = await setSkillEnabled(skill.id, !skill.enabled)
      setSkills((current) => current.map((item) => (item.id === skill.id ? { ...item, ...updated } : item)))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusyID("")
    }
  }

  async function remove(skill: InstalledSkill) {
    if (!window.confirm(`确定卸载技能「${skill.displayName || skill.skillName}」吗？`)) return
    setBusyID(skill.id)
    setError("")
    try {
      await uninstallSkill(skill.id)
      setSkills((current) => current.filter((item) => item.id !== skill.id))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusyID("")
    }
  }

  async function update(skill: InstalledSkill) {
    setBusyID(skill.id)
    setError("")
    try {
      const nextPreview = await inspectSkillUpdate(skill.id)
      setPreview(nextPreview)
      setSourceType(nextPreview.source.type)
      setSourceUri(nextPreview.source.uri)
      setSourceRef(nextPreview.source.ref)
      setSourceSubpath(nextPreview.source.subpath)
      setScope(nextPreview.scope)
      setInstallOpen(true)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusyID("")
    }
  }

  async function view(skill: InstalledSkill) {
    setBusyID(skill.id)
    setError("")
    try {
      setDetails(await getSkillDetails(skill.id))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusyID("")
    }
  }

  return (
    <motion.main
      key="skills"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full min-h-0 flex-col bg-[#faf9f7] text-stone-800"
    >
      <header className="flex h-[12vh] min-h-[76px] shrink-0 items-center border-b border-stone-200 bg-white/90 px-[4vw]">
        <button type="button" onClick={onBack} className="mr-5 rounded-full p-2 text-stone-500 hover:bg-stone-100" aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-[clamp(1.35rem,2.7vh,2rem)] font-semibold">技能</h1>
          <p className="mt-1 text-xs text-stone-500">{installedCount} 个已安装技能 · 按任务动态加载工作流</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => void refresh()} className="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-stone-500 hover:bg-stone-100">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> 刷新
          </button>
          <button type="button" onClick={() => { setInstallOpen(true); setPreview(null) }} className="rounded-full bg-[#d87300] px-5 py-2 text-sm text-white hover:bg-[#c46600]">
            安装技能
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-[5vw] py-6">
        {error && <div className="mx-auto mb-4 max-w-5xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <section className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {loading && skills.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-stone-400"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />读取技能目录</div>
          ) : skills.length ? (
            skills.map((skill) => (
              <SkillRow key={skill.id} skill={skill} busy={busyID === skill.id} onToggle={() => void toggle(skill)} onUninstall={() => void remove(skill)} onUpdate={() => void update(skill)} onView={() => void view(skill)} />
            ))
          ) : (
            <div className="p-10 text-center text-stone-400">还没有可用技能</div>
          )}
        </section>
      </div>

      {details && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-5 backdrop-blur-sm">
          <div className="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div>
                <h2 className="text-lg font-semibold">{details.displayName || details.skillName}</h2>
                <p className="mt-1 text-xs text-stone-500">{details.skillName} · {details.sourceType === "generated" ? "智能体创建" : details.sourceType}</p>
              </div>
              <button type="button" onClick={() => setDetails(null)} className="ml-auto rounded-full p-2 text-stone-400 hover:bg-stone-100"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-4 text-sm leading-6 text-stone-600">{details.description}</p>
            <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border border-stone-200 bg-stone-50 p-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-stone-700">{details.content || "本地 SKILL.md 不可用"}</pre>
            </div>
            {details.files.length > 0 && <p className="mt-3 text-xs text-stone-400">包含文件：{details.files.join("、")}</p>}
            {details.sourceType === "generated" && <p className="mt-3 text-xs text-amber-700">需要修改时，直接在聊天中让当前角色更新这个技能。</p>}
          </div>
        </div>
      )}

      {installOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-5 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center">
              <div>
                <h2 className="text-lg font-semibold">安装技能</h2>
                <p className="mt-1 text-xs text-stone-500">先预检内容、权限与目录安全，再确认安装。</p>
              </div>
              <button type="button" onClick={() => setInstallOpen(false)} className="ml-auto rounded-full p-2 text-stone-400 hover:bg-stone-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
              <button type="button" onClick={() => { setSourceType("local"); setPreview(null) }} className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm ${sourceType === "local" ? "bg-white text-[#d87300] shadow-sm" : "text-stone-500"}`}><FolderOpen className="h-4 w-4" />本地目录</button>
              <button type="button" onClick={() => { setSourceType("git"); setPreview(null) }} className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm ${sourceType === "git" ? "bg-white text-[#d87300] shadow-sm" : "text-stone-500"}`}><Github className="h-4 w-4" />Git 仓库</button>
            </div>
            <label className="mt-4 block text-xs font-medium text-stone-600">{sourceType === "local" ? "技能目录" : "仓库地址"}</label>
            <div className="mt-1 flex gap-2">
              <input value={sourceUri} onChange={(event) => { setSourceUri(event.target.value); setPreview(null) }} placeholder={sourceType === "local" ? "/path/to/skill" : "https://github.com/owner/repo.git"} className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400" />
              {sourceType === "local" && <button type="button" onClick={() => void chooseDirectory()} className="rounded-xl border border-stone-200 px-3 text-stone-500 hover:bg-stone-50"><FolderOpen className="h-4 w-4" /></button>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {sourceType === "git" && <input value={sourceRef} onChange={(event) => { setSourceRef(event.target.value); setPreview(null) }} placeholder="分支/标签（可选）" className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400" />}
              <input value={sourceSubpath} onChange={(event) => { setSourceSubpath(event.target.value); setPreview(null) }} placeholder="仓库内子目录（可选）" className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400" />
              <select value={scope} onChange={(event) => { setScope(event.target.value as "user" | "project"); setPreview(null) }} className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400">
                <option value="user">当前用户</option>
                <option value="project">当前项目</option>
              </select>
            </div>
            {preview && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><ShieldCheck className="h-4 w-4" />预检通过：{preview.displayName}</div>
                <p className="mt-1 text-xs leading-5 text-emerald-700">{preview.description}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-emerald-700"><span>{preview.skillName}</span><span>v{preview.version}</span><span>{preview.fileCount} 个文件</span><span>{readableBytes(preview.totalBytes)}</span><span>{preview.tools.length} 个工具</span></div>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setInstallOpen(false)} className="rounded-full px-4 py-2 text-sm text-stone-500 hover:bg-stone-100">取消</button>
              {!preview ? (
                <button type="button" disabled={!sourceUri.trim() || busyID === "inspect"} onClick={() => void inspect()} className="flex items-center gap-2 rounded-full bg-[#d87300] px-5 py-2 text-sm text-white disabled:opacity-50">{busyID === "inspect" && <LoaderCircle className="h-4 w-4 animate-spin" />}预检</button>
              ) : (
                <button type="button" disabled={busyID === "install"} onClick={() => void install()} className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm text-white disabled:opacity-50">{busyID === "install" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{preview.replaceInstallationID ? "确认更新" : "确认安装"}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.main>
  )
}
