import { useEffect, useRef, useState } from 'react'
import { promptModeConfigSchema, type PromptMode, type PromptModeConfig } from '@eden/api'
import { rpcRequestForOrigin } from './rpc-transport'
import { getRuntimeOriginRevision, getStoredRuntimeOrigin } from './runtime-origin'

const defaults: PromptModeConfig = { enabled: false, updatedAt: 0 }
const changedEvent = 'edenagent:prompt-mode-changed'
type ModeChange = { origin: 'mon' | 'local'; revision: number; config: PromptModeConfig }

function subscribeModeChanges(receive: (change: ModeChange) => void) {
  const listener = (event: Event) => {
    const value = (event as CustomEvent<ModeChange>).detail
    if (!value || !['mon', 'local'].includes(value.origin) || !Number.isInteger(value.revision)) return
    const parsed = promptModeConfigSchema.safeParse(value.config)
    if (parsed.success) receive({ origin: value.origin, revision: value.revision, config: parsed.data })
  }
  window.addEventListener(changedEvent, listener)
  return () => window.removeEventListener(changedEvent, listener)
}

export function usePromptMode() {
  const [epoch, setEpoch] = useState(0)
  const [value, setValue] = useState(defaults)
  const [saved, setSaved] = useState(defaults)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const owner = useRef<{ origin: 'mon' | 'local'; revision: number; live: boolean; saving: boolean } | null>(null)
  const accept = (config: PromptModeConfig) => {
    setValue(previous => previous.updatedAt > config.updatedAt ? previous : config)
    setSaved(previous => previous.updatedAt > config.updatedAt ? previous : config)
  }
  useEffect(() => {
    const reload = () => setEpoch(value => value + 1)
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'agent.runtime_origin' || event.key === 'agent.auth_token') reload()
    }
    window.addEventListener('edenagent:account-changed', reload)
    window.addEventListener('edenagent:runtime-origin-changed', reload)
    window.addEventListener('storage', storage)
    const unsubscribe = subscribeModeChanges(change => {
      const scope = owner.current
      if (scope?.live && scope.origin === change.origin && scope.revision === change.revision && scope.revision === getRuntimeOriginRevision()) {
        accept(change.config)
        setError('')
      }
    })
    return () => {
      window.removeEventListener('edenagent:account-changed', reload)
      window.removeEventListener('edenagent:runtime-origin-changed', reload)
      window.removeEventListener('storage', storage)
      unsubscribe()
    }
  }, [])
  useEffect(() => {
    const scope = { origin: getStoredRuntimeOrigin() ?? 'mon', revision: getRuntimeOriginRevision(), live: true, saving: false }
    owner.current = scope
    setReady(false); setSaving(false); setError(''); setValue(defaults); setSaved(defaults)
    void rpcRequestForOrigin(scope.origin, 'prompt.mode.get', {}, scope.revision).then(result => {
      if (scope.live && scope.revision === getRuntimeOriginRevision()) { accept(result); setReady(true) }
    }).catch(reason => { if (scope.live) setError(String(reason)) })
    return () => { scope.live = false }
  }, [epoch])

  const save = async (enabled = value.enabled) => {
    const scope = owner.current
    if (!scope?.live || !ready || scope.saving || scope.revision !== getRuntimeOriginRevision()) return
    scope.saving = true
    setSaving(true); setError('')
    try {
      const result = await rpcRequestForOrigin(scope.origin, 'prompt.mode.update', {
        enabled, expectedUpdatedAt: saved.updatedAt,
      }, scope.revision)
      if (scope.live && scope.revision === getRuntimeOriginRevision()) {
        accept(result)
        window.dispatchEvent(new CustomEvent<ModeChange>(changedEvent, { detail: { origin: scope.origin, revision: scope.revision, config: result } }))
      }
    } catch (reason) { if (scope.live) setError(String(reason)) }
    finally { scope.saving = false; if (scope.live) setSaving(false) }
  }
  const change = (patch: Partial<PromptMode>) => setValue(previous => ({ ...previous, ...patch }))
  return { value, saved, ready, saving, error, change, save, reload: () => setEpoch(value => value + 1),
    dirty: value.enabled !== saved.enabled }
}
