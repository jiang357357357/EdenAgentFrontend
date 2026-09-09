import { useEffect, useState } from 'react'
import { useSkillClient, type InstalledSkill } from '../../lib/skill-client'
import { SkillFiles } from './SkillFiles'

export function SkillManagement({ skill, onChanged }: { skill: InstalledSkill; onChanged: () => Promise<void> }) {
  const { getSkillDetails, setSkillEnabled, uninstallSkill } = useSkillClient()
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    let active = true
    setContent(''); setFiles([]); setError(''); setConfirmDelete(false)
    void getSkillDetails(skill.id, skill).then(result => { if (active) { setContent(result.content); setFiles(result.files) } })
      .catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [skill.id, skill.contentHash, skill.workspaceRoot, getSkillDetails])
  async function change(remove: boolean) {
    setBusy(true); setError('')
    try {
      if (remove) await uninstallSkill(skill.id, skill)
      else await setSkillEnabled(skill.id, !skill.enabled, skill)
      setConfirmDelete(false)
      await onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  return <div className="mt-4 rounded-xl border border-stone-200 bg-white p-3 text-xs">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy} onClick={() => void change(false)} className="text-amber-700 disabled:opacity-50">
        {skill.enabled ? '停用技能' : '启用技能'}
      </button>
      <button type="button" disabled={busy || skill.builtin} onClick={() => setConfirmDelete(true)} className="text-red-700 disabled:opacity-50">卸载</button>
    </div>
    {skill.builtin && <p className="mt-2 text-stone-500">系统技能可在当前世界停用；移除源文件需由管理员调整技能目录。</p>}
    {confirmDelete && <div className="mt-3 space-x-3">
      <span>卸载“{skill.displayName || skill.skillName}”？</span>
      <button type="button" disabled={busy} onClick={() => void change(true)} className="text-red-700">确认卸载</button>
      <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>取消</button>
    </div>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    <details className="mt-3">
      <summary className="cursor-pointer text-stone-600">查看技能说明</summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-stone-600">{content || '暂无正文'}</pre>
    </details>
    <SkillFiles key={`${skill.id}:${skill.contentHash}:${skill.workspaceRoot}`} skill={skill} files={files} />
  </div>
}
