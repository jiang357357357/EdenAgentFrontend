import { pageEnterMotion } from "../../lib/page-motion"
import { SkillInstallDialog } from './SkillInstallDialog'
import { SkillManagement } from "./SkillManagement"
import { useSkillClient } from '../../lib/skill-client'
import { useRuntimeOrigin } from '../../lib/use-runtime-origin'
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ChevronRight,
  Clipboard,
  Code2,
  LoaderCircle,
  MessageSquare,
  Package,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react"
import { motion } from "motion/react"
import {
  getToolStatus,
  type InstalledSkill,
  type ToolDefinition,
} from "../../lib/agent-client"

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
      className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition ${selected ? "border-accent bg-accent-dim shadow-sm" : "border-border bg-card hover:border-border hover:bg-border/70"}`}
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-dim text-accent">
        <Package className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-text">{skill.displayName || skill.skillName}</h3>
          {skill.builtin && <span className="rounded bg-warning-dim px-1.5 py-0.5 text-[11px] text-warning">内置</span>}
          <span
            className={`ml-auto rounded-md px-2 py-0.5 text-[11px] ${!skill.available ? "bg-danger-dim text-danger" : skill.enabled ? "bg-success-dim text-success" : "bg-bg text-text-muted"}`}
          >
            {busy ? "处理中" : status}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{skill.description}</p>
        {!!skill.missingTools?.length && <p className="mt-1 text-xs text-danger">缺少可用工具：{skill.missingTools.join("、")}</p>}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-muted">
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
      <ChevronRight className={`mt-2 h-4 w-4 shrink-0 ${selected ? "text-accent" : "text-text"}`} />
    </button>
  )
}

export function SkillPage({ onBack }: { onBack: () => void }) {
  const origin = useRuntimeOrigin()
  return <ScopedSkillPage key={origin} onBack={onBack} />
}

function ScopedSkillPage({ onBack }: { onBack: () => void }) {
  const { listSkills, refreshCatalog, catalogStatus } = useSkillClient()
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [installOpen, setInstallOpen] = useState(false)
  const [selectedID, setSelectedID] = useState("")
  const [query, setQuery] = useState("")
  const [toolQuery, setToolQuery] = useState("")
  const [selectedToolName, setSelectedToolName] = useState("")
  const [toolDetails, setToolDetails] = useState<Record<string, ToolDefinition>>({})
  const refreshGeneration = useRef(0)

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current
    setLoading(true)
    setError("")
    try {
      const [nextSkills, status, toolStatus] = await Promise.all([listSkills(), catalogStatus(), getToolStatus()])
      if (generation !== refreshGeneration.current) return
      setSkills(nextSkills)
      setToolDetails(toolStatus.toolDetails ?? {})
      if (status.error) setError(`目录刷新失败，保留上次有效目录：${status.error}`)
      setSelectedID((current) =>
        nextSkills.some((skill) => skill.id === current) ? current : (nextSkills[0]?.id ?? ""),
      )
    } catch (nextError) {
      if (generation !== refreshGeneration.current) return
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      if (generation === refreshGeneration.current) setLoading(false)
    }
  }, [listSkills, catalogStatus])

  const rescan = async () => {
    const generation = ++refreshGeneration.current
    setLoading(true)
    try { await refreshCatalog(); if (generation === refreshGeneration.current) await refresh() }
    catch (error) { if (generation === refreshGeneration.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (generation === refreshGeneration.current) setLoading(false) }
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 10000)
    const handleChanged = () => void refresh()
    window.addEventListener("edenagent:skills-changed", handleChanged)
    window.addEventListener("edenagent:workspace-changed", handleChanged)
    return () => {
      refreshGeneration.current++
      window.clearInterval(timer)
      window.removeEventListener("edenagent:skills-changed", handleChanged)
      window.removeEventListener("edenagent:workspace-changed", handleChanged)
    }
  }, [refresh])

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


  return (
    <motion.main
      key="skills"
      {...pageEnterMotion}
      className="theme-page surface-scrollbars flex h-full min-h-0 flex-col bg-bg text-text"
    >
      <div className="grid min-h-0 flex-1 grid-cols-[30%_31%_minmax(0,1fr)] bg-bg">
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-border bg-bg p-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg p-2 text-text-muted hover:bg-border"
              aria-label="返回"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold">技能</h1>
              <p className="text-xs text-text-muted">工作流与能力包</p>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
              <Search className="h-4 w-4 text-text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索技能…"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            <button type="button" disabled={loading} className="shrink-0 rounded-xl border border-border px-3 text-sm disabled:opacity-50"
              onClick={() => void rescan()}>
              刷新目录
            </button>
            <button
              type="button"
              onClick={() => {
                setInstallOpen(true)
              }}
              className="shrink-0 rounded-xl bg-accent px-4 text-sm text-on-accent hover:bg-accent-hover"
            >
              安装技能
            </button>
          </div>
          {error && (
            <div className="mt-3 rounded-xl border border-danger/30 bg-danger-dim px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {loading && skills.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-text-muted">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
                读取技能目录
              </div>
            ) : (
              filteredSkills.map((skill) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  selected={selectedSkill?.id === skill.id}
                  busy={false}
                  onSelect={() => setSelectedID(skill.id)}
                />
              ))
            )}
            {!loading && filteredSkills.length === 0 && (
              <div className="py-16 text-center text-sm text-text-muted">没有符合条件的技能</div>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col border-r border-border bg-bg p-5">
          {selectedSkill ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-dim text-accent">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">
                    {selectedSkill.displayName || selectedSkill.skillName}
                  </h2>
                  <p className="text-xs text-text-muted">{selectedToolNames.length} 个工具</p>
                </div>
              </div>
              <SkillManagement key={selectedSkill.id} skill={selectedSkill} onChanged={refresh} />
              <label className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3">
                <Search className="h-4 w-4 text-text-muted" />
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
                      className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left ${active ? "border-accent bg-accent-dim" : "border-border bg-card hover:bg-border"}`}
                    >
                      <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-text" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <b className="truncate font-mono text-sm">{name}</b>
                          <span
                            className={`ml-auto rounded px-2 py-0.5 text-[10px] ${tool?.exposure === "direct" ? "bg-info-dim text-info" : "bg-accent-dim text-accent"}`}
                          >
                            {tool?.exposure === "direct" ? "直接" : "按需"}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] ${tool?.requiresPermission ? "bg-warning-dim text-warning" : "bg-success-dim text-success"}`}
                          >
                            {tool?.requiresPermission ? "需确认" : "只读"}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                          {tool?.description || "工具信息暂不可用"}
                        </p>
                      </div>
                      <ChevronRight
                        className={`mt-1 h-4 w-4 shrink-0 ${active ? "text-accent" : "text-text"}`}
                      />
                    </button>
                  )
                })}
                {selectedToolNames.length === 0 && (
                  <div className="py-16 text-center text-sm text-text-muted">此技能不直接提供工具</div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">选择一个技能</div>
          )}
        </section>

        <section className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-bg p-6">
          {selectedToolName ? (
            <div className="mx-auto max-w-4xl">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-accent-dim">
                  <Wrench className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-mono text-2xl font-semibold">{selectedToolName}</h2>
                  <p className="mt-1 text-sm text-text-muted">{selectedTool?.label || "工具"}</p>
                  <div className="mt-2 flex gap-2">
                    <span className="rounded bg-info-dim px-2 py-1 text-xs text-info">
                      {selectedTool?.exposure === "direct" ? "直接工具" : "按需工具"}
                    </span>
                    <span
                      className={`rounded px-2 py-1 text-xs ${selectedTool?.requiresPermission ? "bg-warning-dim text-warning" : "bg-success-dim text-success"}`}
                    >
                      {selectedTool?.requiresPermission ? "需确认" : "只读"}
                    </span>
                    <span className="rounded bg-bg px-2 py-1 text-xs text-text-muted">
                      {selectedTool?.source || "builtin"}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-5 text-sm leading-7 text-text-muted">
                {selectedTool?.description || "当前服务尚未返回此工具的详细说明。"}
              </p>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Code2 className="h-4 w-4" />
                    参数
                  </h3>
                  <div className="mt-3 overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-bg text-text-muted">
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
                          <tr key={name} className="border-t border-border">
                            <td className="px-3 py-2 font-mono">{name}</td>
                            <td className="px-3 py-2">{String(schema.type || "any")}</td>
                            <td className="px-3 py-2">
                              {((selectedTool?.parameters?.required as string[] | undefined) ?? []).includes(name)
                                ? "是"
                                : "否"}
                            </td>
                            <td className="px-3 py-2 text-text-muted">{String(schema.description || "")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!Object.keys((selectedTool?.parameters?.properties as Record<string, unknown> | undefined) ?? {})
                      .length && <div className="px-3 py-4 text-xs text-text-muted">无需参数</div>}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4" />
                    权限与行为
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-bg text-xs">
                    {[
                      ["权限", selectedTool?.requiresPermission ? selectedToolName : "无需确认"],
                      ["暴露方式", selectedTool?.exposure === "direct" ? "直接可用" : "按需加载"],
                      ["命名空间", selectedTool?.namespace || "general"],
                      ["执行方式", selectedTool?.executionMode || "默认"],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-bg px-3 py-3">
                        <span className="text-text-muted">{label}</span>
                        <p className="mt-1 font-medium text-text">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Code2 className="h-4 w-4" />
                    调用示例
                  </h3>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-bg p-4 font-mono text-xs text-text-muted">
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
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm"
                >
                  <Clipboard className="h-4 w-4" />
                  复制工具名称
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm text-on-accent"
                >
                  <MessageSquare className="h-4 w-4" />
                  返回聊天中试用
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">选择一个工具查看详情</div>
          )}
        </section>
      </div>

      {installOpen && <SkillInstallDialog onClose={() => setInstallOpen(false)} onInstalled={refresh} />}
    </motion.main>
  )
}
