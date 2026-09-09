import { useEffect, useState } from 'react'
import { getSkillDetails, setSkillEnabled, uninstallSkill, type InstalledSkill } from '../../lib/agent-client'

export function SkillManagement({ skill, onChanged }: { skill: InstalledSkill; onChanged: () => Promise<void> }) {
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    let active = true
    setContent(''); setError(''); setConfirmDelete(false)
    void getSkillDetails(skill.id).then(result => { if (active) setContent(result.content) })
      .catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [skill.id, skill.contentHash, skill.workspaceRoot])
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
      <button type="button" disabled={busy || skill.builtin} onClick={() => void change(false)} className="text-amber-700 disabled:opacity-50">
        {skill.enabled ? '停用技能' : '启用技能'}
      </button>
      <button type="button" disabled={busy || skill.builtin} onClick={() => setConfirmDelete(true)} className="text-red-700 disabled:opacity-50">卸载</button>
    </div>
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
  </div>
}
