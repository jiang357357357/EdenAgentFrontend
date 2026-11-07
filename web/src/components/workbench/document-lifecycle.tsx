import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode, type SetStateAction } from 'react'
import { initialWorkbench, restoreWorkbench, type WorkbenchTab } from './workbench-state'
import type { JsonValue } from '@eden/api'

type Entry = { dirty: boolean; save?: () => Promise<void>; saveLabel?: string; discard?: () => void }
export class DocumentLifecycle {
  private entries = new Map<string, Entry>()
  private viewStates=new Map<string,Map<string,JsonValue>>()
  private listeners = new Set<() => void>()
  private revision = 0
  notice = ''
  constructor(readonly scope: string) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  snapshot = () => this.revision
  private publish() { this.revision++; this.listeners.forEach(listener => listener()) }
  entry(id: string): Entry { return this.entries.get(id) ?? { dirty: false } }
  dirty(id: string, dirty: boolean) { const entry = this.entry(id); if (entry.dirty !== dirty) { if(dirty)this.notice=''; this.entries.set(id, { ...entry, dirty }); this.publish() } }
  register(id: string, hooks: Omit<Entry, 'dirty'>) {
    this.entries.set(id, { ...this.entry(id), ...hooks }); this.publish()
    return () => { const entry = this.entries.get(id); if (entry && entry.save === hooks.save) { if(entry.dirty)this.entries.set(id,{dirty:true});else this.entries.delete(id);this.publish() } }
  }
  async save(id: string) {
    const entry = this.entry(id)
    if (!entry.save) throw new Error('当前页面没有注册保存操作。')
    await entry.save()
    this.dirty(id, false); this.notice = entry.saveLabel || '已保存'; this.publish()
  }
  discard(id: string) { this.entry(id).discard?.(); this.entries.delete(id); this.viewStates.delete(id); this.publish() }
  readViewState(id:string,key:string){return this.viewStates.get(id)?.get(key)??null}
  writeViewState(id:string,key:string,value:JsonValue){let states=this.viewStates.get(id);if(!states){states=new Map();this.viewStates.set(id,states)}states.set(key,value)}
  releaseViewState(id:string){this.viewStates.delete(id)}
  releaseDocument(id:string){this.entries.delete(id);this.viewStates.delete(id);this.publish()}
  readDraft(id: string) { try { return localStorage.getItem(this.scope + ':draft:' + id) ?? '' } catch { return '' } }
  writeDraft(id: string, value: string) {
    try { if (value) localStorage.setItem(this.scope + ':draft:' + id, value); else localStorage.removeItem(this.scope + ':draft:' + id) }
    catch { this.notice = '草稿未能保存到本机，请保留当前页面。'; this.publish(); throw new Error(this.notice) }
  }
  clearDraft(id: string) { this.writeDraft(id, '') }
  anyDirty() { return [...this.entries.values()].some(entry => entry.dirty) }
  archived(): WorkbenchTab[] { try { return restoreWorkbench(localStorage.getItem(this.scope+':closed-drafts')).tabs } catch { return [] } }
  remember(tab: WorkbenchTab) {
    if(tab.kind!=='chat'||!this.readDraft(tab.id)) return
    const tabs=[...this.archived().filter(item=>item.id!==tab.id),tab]
    try { localStorage.setItem(this.scope+':closed-drafts',JSON.stringify({...initialWorkbench(),tabs})) }
    catch { throw new Error('本机草稿索引保存失败，请保留当前页面。') }
  }
}
const Context = createContext<{ store: DocumentLifecycle; id: string } | null>(null)
export function DocumentScope({ store, id, children }: { store: DocumentLifecycle; id: string; children: ReactNode }) {
  return <Context.Provider value={{ store, id }}>{children}</Context.Provider>
}
export function useDocumentLifecycle() { return useContext(Context) }
export function useDocumentRegistration({ dirty, save, discard, saveLabel }: { dirty: boolean; save?: () => Promise<void>; discard?: () => void; saveLabel?: string }) {
  const binding = useDocumentLifecycle(), latest = useRef({ save, discard })
  latest.current = { save, discard }
  const store = binding?.store, id = binding?.id
  useEffect(() => {
    if (!store || !id) return
    return store.register(id, { ...(save ? { save: async () => { await latest.current.save?.() } } : {}), discard: () => latest.current.discard?.(), saveLabel })
  }, [store, id, !!save, saveLabel])
  useEffect(() => { if (store && id) store.dirty(id, dirty) }, [store, id, dirty])
}
export function useDraftInput(fallback: string, setFallback: (value: SetStateAction<string>) => void, hasAttachments = false) {
  const binding = useDocumentLifecycle(), loaded = useRef(false), value = useRef(fallback)
  const latest = useRef(fallback); latest.current = fallback
  const blocked = useRef(hasAttachments); blocked.current = hasAttachments
  useEffect(() => {
    if (!binding) return
    if (!loaded.current) {
      loaded.current = true
      const text = binding.store.readDraft(binding.id)
      value.current = text; setFallback(text)
    }
    return binding.store.register(binding.id, { save: async () => {
      if (blocked.current) throw new Error('附件尚未发送，请先发送或移除附件后保存草稿。')
      binding.store.writeDraft(binding.id, latest.current)
    },
      saveLabel: '本机聊天草稿已保存', discard: () => { binding.store.clearDraft(binding.id); value.current = ''; setFallback('') } })
  }, [binding?.store, binding?.id])
  useEffect(() => { if (binding) binding.store.dirty(binding.id, !!fallback || hasAttachments) }, [binding?.store, binding?.id, fallback, hasAttachments])
  const set = (next: SetStateAction<string>) => {
    const text = typeof next === 'function' ? next(value.current) : next
    value.current = text; setFallback(text)
    if (binding) {
      binding.store.dirty(binding.id, !!text)
      try { binding.store.writeDraft(binding.id, text) } catch { /* The store exposes a visible save error. */ }
    }
  }
  return set
}
export function useLifecycleRevision(store: DocumentLifecycle) { return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot) }
