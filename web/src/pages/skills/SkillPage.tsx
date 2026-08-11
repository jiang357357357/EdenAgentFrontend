import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  FolderOpen,
  Github,
  LoaderCircle,
  MessageSquare,
  Package,
  Search,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react"
import { motion } from "motion/react"
import {
  inspectSkill,
  installSkill,
  listSkills,
  getToolStatus,
  type InstalledSkill,
  type SkillPreview,
  type ToolDefinition,
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
  selected,
  busy,
  onSelect,
}: {
  skill: InstalledSkill
  selected: boolean
  busy: boolean
  onSelect: () => void
}) {
  const status = !skill.available ? "不可用" : skill.enabled ? "已启用" : "已停用"
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition ${selected ? "border-[#e27a00] bg-[#fff8ef] shadow-sm" : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/70"}`}
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff1dc] text-[#d87300]">
        <Package className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-stone-800">{skill.displayName || skill.skillName}</h3>
          {skill.builtin && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">内置</span>}
          <span
            className={`ml-auto rounded-md px-2 py-0.5 text-[11px] ${!skill.available ? "bg-red-50 text-red-600" : skill.enabled ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
          >
            {busy ? "处理中" : status}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{skill.description}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-stone-400">
          <span>{skill.scope === "system" ? "系统范围" : skill.scope === "project" ? "当前项目" : "当前用户"}</span>
          <span>
            {skill.sourceType === "git"
              ? "Git"
              : skill.sourceType === "local"
                ? "本地目录"
                : skill.sourceType === "generated"
                  ? "智能体创建"
                  : "随应用提供"}
          </span>
          {skill.tools?.length ? <span>{skill.tools.length} 个工具</span> : null}
        </div>
      </div>
      <ChevronRight className={`mt-2 h-4 w-4 shrink-0 ${selected ? "text-[#d87300]" : "text-stone-300"}`} />
    </button>
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
  const [selectedID, setSelectedID] = useState("")
  const [query, setQuery] = useState("")
  const [toolQuery, setToolQuery] = useState("")
  const [selectedToolName, setSelectedToolName] = useState("")
  const [toolDetails, setToolDetails] = useState<Record<string, ToolDefinition>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const nextSkills = await listSkills()
      setSkills(nextSkills)
      setSelectedID((current) =>
        nextSkills.some((skill) => skill.id === current) ? current : (nextSkills[0]?.id ?? ""),
      )
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

  useEffect(() => {
    void getToolStatus()
      .then((status) => setToolDetails(status.toolDetails ?? {}))
      .catch(() => setToolDetails({}))
  }, [])

  const selectedSkill = skills.find((skill) => skill.id === selectedID) ?? skills[0]
  const filteredSkills = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return skills.filter((skill) => {
      const matchesQuery =
        !normalized ||
        `${skill.displayName} ${skill.skillName} ${skill.description}`.toLocaleLowerCase().includes(normalized)
      return matchesQuery
    })
  }, [query, skills])
  const selectedToolNames = selectedSkill?.tools ?? []
  const filteredToolNames = selectedToolNames.filter((name) => {
    const normalized = toolQuery.trim().toLocaleLowerCase()
    const tool = toolDetails[name]
    return (
      !normalized || `${name} ${tool?.label ?? ""} ${tool?.description ?? ""}`.toLocaleLowerCase().includes(normalized)
    )
  })
  const selectedTool = selectedToolName ? toolDetails[selectedToolName] : undefined

  useEffect(() => {
    setSelectedToolName((current) => (selectedToolNames.includes(current) ? current : (selectedToolNames[0] ?? "")))
    setToolQuery("")
  }, [selectedSkill?.id, selectedToolNames.join("\u001f")])

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

  return (
    <motion.main
      key="skills"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="surface-scrollbars flex h-full min-h-0 flex-col bg-[#faf9f7] text-stone-800"
    >
      <div className="grid min-h-0 flex-1 grid-cols-[30%_31%_minmax(0,1fr)] bg-[#f7f6f3]">
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-stone-200 bg-[#fbfaf8] p-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
              aria-label="返回"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold">技能</h1>
              <p className="text-xs text-stone-400">工作流与能力包</p>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3">
              <Search className="h-4 w-4 text-stone-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索技能…"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setInstallOpen(true)
                setPreview(null)
              }}
              className="shrink-0 rounded-xl bg-[#d87300] px-4 text-sm text-white hover:bg-[#c46600]"
            >
              安装技能
            </button>
          </div>
          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {loading && skills.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-stone-400">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
                读取技能目录
              </div>
            ) : (
              filteredSkills.map((skill) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  selected={selectedSkill?.id === skill.id}
                  busy={busyID === skill.id}
                  onSelect={() => setSelectedID(skill.id)}
                />
              ))
            )}
            {!loading && filteredSkills.length === 0 && (
              <div className="py-16 text-center text-sm text-stone-400">没有符合条件的技能</div>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col border-r border-stone-200 bg-[#f8f7f5] p-5">
          {selectedSkill ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0dc] text-[#d87300]">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">
                    {selectedSkill.displayName || selectedSkill.skillName}
                  </h2>
                  <p className="text-xs text-stone-400">{selectedToolNames.length} 个工具</p>
                </div>
              </div>
              <label className="mt-4 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3">
                <Search className="h-4 w-4 text-stone-400" />
                <input
                  value={toolQuery}
                  onChange={(event) => setToolQuery(event.target.value)}
                  placeholder="搜索此技能的工具…"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {filteredToolNames.map((name) => {
                  const tool = toolDetails[name]
                  const active = name === selectedToolName
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedToolName(name)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left ${active ? "border-[#e27a00] bg-[#fff8ef]" : "border-stone-200 bg-white hover:bg-stone-50"}`}
                    >
                      <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-stone-700" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <b className="truncate font-mono text-sm">{name}</b>
                          <span
                            className={`ml-auto rounded px-2 py-0.5 text-[10px] ${tool?.exposure === "direct" ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"}`}
                          >
                            {tool?.exposure === "direct" ? "直接" : "按需"}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] ${tool?.requiresPermission ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                          >
                            {tool?.requiresPermission ? "需确认" : "只读"}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
                          {tool?.description || "工具信息暂不可用"}
                        </p>
                      </div>
                      <ChevronRight
                        className={`mt-1 h-4 w-4 shrink-0 ${active ? "text-[#d87300]" : "text-stone-300"}`}
                      />
                    </button>
                  )
                })}
                {selectedToolNames.length === 0 && (
                  <div className="py-16 text-center text-sm text-stone-400">此技能不直接提供工具</div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-stone-400">选择一个技能</div>
          )}
        </section>

        <section className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-[#fcfbf9] p-6">
          {selectedToolName ? (
            <div className="mx-auto max-w-4xl">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-200 bg-[#fff8ee]">
                  <Wrench className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-mono text-2xl font-semibold">{selectedToolName}</h2>
                  <p className="mt-1 text-sm text-stone-500">{selectedTool?.label || "工具"}</p>
                  <div className="mt-2 flex gap-2">
                    <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-600">
                      {selectedTool?.exposure === "direct" ? "直接工具" : "按需工具"}
                    </span>
                    <span
                      className={`rounded px-2 py-1 text-xs ${selectedTool?.requiresPermission ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                    >
                      {selectedTool?.requiresPermission ? "需确认" : "只读"}
                    </span>
                    <span className="rounded bg-stone-100 px-2 py-1 text-xs text-stone-500">
                      {selectedTool?.source || "builtin"}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-5 text-sm leading-7 text-stone-600">
                {selectedTool?.description || "当前服务尚未返回此工具的详细说明。"}
              </p>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-stone-200 bg-white p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Code2 className="h-4 w-4" />
                    参数
                  </h3>
                  <div className="mt-3 overflow-hidden rounded-xl border border-stone-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-50 text-stone-500">
                        <tr>
                          <th className="px-3 py-2">字段</th>
                          <th className="px-3 py-2">类型</th>
                          <th className="px-3 py-2">必填</th>
                          <th className="px-3 py-2">说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(
                          (selectedTool?.parameters?.properties as
                            | Record<string, Record<string, unknown>>
                            | undefined) ?? {},
                        ).map(([name, schema]) => (
                          <tr key={name} className="border-t border-stone-200">
                            <td className="px-3 py-2 font-mono">{name}</td>
                            <td className="px-3 py-2">{String(schema.type || "any")}</td>
                            <td className="px-3 py-2">
                              {((selectedTool?.parameters?.required as string[] | undefined) ?? []).includes(name)
                                ? "是"
                                : "否"}
                            </td>
                            <td className="px-3 py-2 text-stone-500">{String(schema.description || "")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!Object.keys((selectedTool?.parameters?.properties as Record<string, unknown> | undefined) ?? {})
                      .length && <div className="px-3 py-4 text-xs text-stone-400">无需参数</div>}
                  </div>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4" />
                    权限与行为
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-stone-200 text-xs">
                    {[
                      ["权限", selectedTool?.requiresPermission ? selectedToolName : "无需确认"],
                      ["暴露方式", selectedTool?.exposure === "direct" ? "直接可用" : "按需加载"],
                      ["命名空间", selectedTool?.namespace || "general"],
                      ["执行方式", selectedTool?.executionMode || "默认"],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-stone-50 px-3 py-3">
                        <span className="text-stone-400">{label}</span>
                        <p className="mt-1 font-medium text-stone-700">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Code2 className="h-4 w-4" />
                    调用示例
                  </h3>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-stone-50 p-4 font-mono text-xs text-stone-600">
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.keys(
                          (selectedTool?.parameters?.properties as Record<string, unknown> | undefined) ?? {},
                        ).map((name) => [name, `<${name}>`]),
                      ),
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(selectedToolName)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-3 text-sm"
                >
                  <Clipboard className="h-4 w-4" />
                  复制工具名称
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-[#d87300] py-3 text-sm text-white"
                >
                  <MessageSquare className="h-4 w-4" />
                  返回聊天中试用
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-stone-400">选择一个工具查看详情</div>
          )}
        </section>
      </div>

      {installOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-5 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center">
              <div>
                <h2 className="text-lg font-semibold">安装技能</h2>
                <p className="mt-1 text-xs text-stone-500">先预检内容、权限与目录安全，再确认安装。</p>
              </div>
              <button
                type="button"
                onClick={() => setInstallOpen(false)}
                className="ml-auto rounded-full p-2 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setSourceType("local")
                  setPreview(null)
                }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm ${sourceType === "local" ? "bg-white text-[#d87300] shadow-sm" : "text-stone-500"}`}
              >
                <FolderOpen className="h-4 w-4" />
                本地目录
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceType("git")
                  setPreview(null)
                }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm ${sourceType === "git" ? "bg-white text-[#d87300] shadow-sm" : "text-stone-500"}`}
              >
                <Github className="h-4 w-4" />
                Git 仓库
              </button>
            </div>
            <label className="mt-4 block text-xs font-medium text-stone-600">
              {sourceType === "local" ? "技能目录" : "仓库地址"}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={sourceUri}
                onChange={(event) => {
                  setSourceUri(event.target.value)
                  setPreview(null)
                }}
                placeholder={sourceType === "local" ? "/path/to/skill" : "https://github.com/owner/repo.git"}
                className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
              />
              {sourceType === "local" && (
                <button
                  type="button"
                  onClick={() => void chooseDirectory()}
                  className="rounded-xl border border-stone-200 px-3 text-stone-500 hover:bg-stone-50"
                >
                  <FolderOpen className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {sourceType === "git" && (
                <input
                  value={sourceRef}
                  onChange={(event) => {
                    setSourceRef(event.target.value)
                    setPreview(null)
                  }}
                  placeholder="分支/标签（可选）"
                  className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                />
              )}
              <input
                value={sourceSubpath}
                onChange={(event) => {
                  setSourceSubpath(event.target.value)
                  setPreview(null)
                }}
                placeholder="仓库内子目录（可选）"
                className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
              />
              <select
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as "user" | "project")
                  setPreview(null)
                }}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400"
              >
                <option value="user">当前用户</option>
                <option value="project">当前项目</option>
              </select>
            </div>
            {preview && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <ShieldCheck className="h-4 w-4" />
                  预检通过：{preview.displayName}
                </div>
                <p className="mt-1 text-xs leading-5 text-emerald-700">{preview.description}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-emerald-700">
                  <span>{preview.skillName}</span>
                  <span>v{preview.version}</span>
                  <span>{preview.fileCount} 个文件</span>
                  <span>{readableBytes(preview.totalBytes)}</span>
                  <span>{preview.tools.length} 个工具</span>
                </div>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInstallOpen(false)}
                className="rounded-full px-4 py-2 text-sm text-stone-500 hover:bg-stone-100"
              >
                取消
              </button>
              {!preview ? (
                <button
                  type="button"
                  disabled={!sourceUri.trim() || busyID === "inspect"}
                  onClick={() => void inspect()}
                  className="flex items-center gap-2 rounded-full bg-[#d87300] px-5 py-2 text-sm text-white disabled:opacity-50"
                >
                  {busyID === "inspect" && <LoaderCircle className="h-4 w-4 animate-spin" />}预检
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyID === "install"}
                  onClick={() => void install()}
                  className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm text-white disabled:opacity-50"
                >
                  {busyID === "install" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {preview.replaceInstallationID ? "确认更新" : "确认安装"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.main>
  )
}
