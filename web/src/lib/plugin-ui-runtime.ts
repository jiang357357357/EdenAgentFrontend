import type * as React from 'react'
import type { PluginUiModule } from '@eden/api'
import type { PluginUiViewProps } from '@eden/plugin-sdk/ui'
import { ExtensionController } from './extensions/extension-controller'

export interface PluginUiLoadedView {
  key: string
  module: PluginUiModule
  view: PluginUiModule['document']['views'][number]
  Component: React.ComponentType<PluginUiViewProps>
  signal: AbortSignal
  extension?: ExtensionController
  resources?: Record<string, string>
  legacySource?: string
  instanceId?: string
}
export interface LoadedExtension { module: PluginUiModule; controller: ExtensionController; signal: AbortSignal }
interface LoadedModule { descriptor: PluginUiModule; controller: AbortController; dispose: () => void; extension?: ExtensionController }
export interface PluginUiSnapshot { views: readonly PluginUiLoadedView[]; errors: readonly string[]; extensions: readonly LoadedExtension[]; catalogReady:boolean }
export class PluginUiRuntime {
  private readonly modules = new Map<string, LoadedModule>()
  private readonly registrations = new Map<string, PluginUiLoadedView>()
  private readonly failures = new Map<string, { fingerprint: string; error: string }>()
  private readonly listeners = new Set<() => void>()
  private snapshot: PluginUiSnapshot = { views: [], errors: [], extensions: [], catalogReady:false }
  private catalogReady=false
  private errors: string[] = []
  private stopped = false
  private generation = 0
  constructor(private readonly read: (module: PluginUiModule) => Promise<PluginUiModule & { source: string; resources?: Record<string, string> }>,
    private readonly report: (module: PluginUiModule, status: 'loaded' | 'unloaded' | 'failed', error?: string, executionState?: 'inactive' | 'activating' | 'ready' | 'failed') => void = () => {}) {}
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback) } }
  getSnapshot = () => this.snapshot
  open() { this.stopped = false; this.generation++ }
  retryFailed() { this.failures.clear() }
  private publish(force = false) {
    const views = [...this.registrations.values()]
    const extensions = [...this.modules.values()].flatMap(item => item.extension ? [{ module: item.descriptor, controller: item.extension, signal: item.controller.signal }] : [])
    const errors = [...this.errors, ...extensions.flatMap(item => item.controller.status().state === 'failed' ? [`${item.module.pluginName}：${item.controller.status().error}`] : [])]
    if (!force && this.catalogReady===this.snapshot.catalogReady && extensions.length === this.snapshot.extensions.length && views.length === this.snapshot.views.length && views.every((view, index) => view === this.snapshot.views[index])
      && errors.length === this.snapshot.errors.length && errors.every((error, index) => error === this.snapshot.errors[index])) return
    this.snapshot = { views, errors, extensions, catalogReady:this.catalogReady }
    this.listeners.forEach(listener => listener())
  }
  async sync(descriptors: PluginUiModule[], errors: string[] = [], catalogReady=true) {
    if (this.stopped) return
    const generation = this.generation
    this.errors = [...errors]
    const desired = new Map(descriptors.map(item => [moduleKey(item), item]))
    for (const key of this.failures.keys()) if (!desired.has(key)) this.failures.delete(key)
    for (const [key, current] of this.modules) {
      const next = desired.get(key)
      if (!next || fingerprint(next) !== fingerprint(current.descriptor)) { current.dispose(); this.modules.delete(key) }
      else if (next.configurationRevision !== current.descriptor.configurationRevision) {
        current.descriptor = { ...current.descriptor, configurationRevision: next.configurationRevision }
        if (next.document.apiVersion === 2) current.extension?.configurationChanged(Object.keys(next.document.contributes.configuration))
        this.publish(true)
      }
    }
    for (const [key, descriptor] of desired) {
      if (this.stopped || generation !== this.generation) return
      if (this.modules.has(key)) continue
      const failed = this.failures.get(key)
      if (failed?.fingerprint === fingerprint(descriptor)) { this.errors.push(failed.error); continue }
      try { await this.load(key, descriptor, generation) }
      catch (error) {
        if (this.stopped || generation !== this.generation) return
        const message = error instanceof Error ? error.message : String(error)
        const summary = `${descriptor.pluginName}：${message}`
        this.errors.push(summary)
        this.failures.set(key, { fingerprint: fingerprint(descriptor), error: summary })
        this.report(descriptor, 'failed', message)
      }
    }
    if (!this.stopped && generation === this.generation) {this.catalogReady=catalogReady;this.publish()}
  }
  private async load(key: string, descriptor: PluginUiModule, generation: number) {
    const loaded = await this.read(descriptor)
    if (this.stopped || generation !== this.generation) return
    if (fingerprint(loaded) !== fingerprint(descriptor)) throw new Error('插件模块在加载期间发生变化')
    const bytes = new TextEncoder().encode(loaded.source)
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('')
    if (digest !== descriptor.sha256) throw new Error('插件模块完整性校验失败')
    if (this.stopped || generation !== this.generation) return
    if (descriptor.document.apiVersion === 2) { await this.loadExtension(key, loaded, generation); return }
    const lifetime = new AbortController()
    for (const view of loaded.document.views) {
      const viewKey = `${key}/${view.id}`
      this.registrations.set(viewKey, { key: viewKey, module: loaded, view, signal: lifetime.signal,
        legacySource: loaded.source, Component: () => null })
    }
    const dispose = () => {
      lifetime.abort()
      for (const view of loaded.document.views) this.registrations.delete(`${key}/${view.id}`)
      this.report(descriptor, 'unloaded')
    }
    this.modules.set(key, { descriptor, controller: lifetime, dispose })
    this.failures.delete(key)
    this.report(descriptor, 'loaded')
  }
  private async loadExtension(key: string, loaded: PluginUiModule & { source: string; resources?: Record<string, string> }, generation: number) {
    const resources = loaded.resources ?? {}
    for (const [name, asset] of Object.entries(loaded.assets ?? {})) {
      const bytes = new TextEncoder().encode(resources[name] ?? '')
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('')
      if (bytes.length !== asset.byteLength || digest !== asset.sha256) throw new Error(`扩展资源完整性校验失败：${name}`)
    }
    if (this.stopped || generation !== this.generation) return
    const lifetime = new AbortController(), extension = new ExtensionController(loaded, loaded.source, () => {
      const diagnostic = extension.status()
      this.report(loaded, diagnostic.state === 'failed' ? 'failed' : 'loaded', diagnostic.error, diagnostic.state)
      this.publish(true)
    })
    for (const view of loaded.document.views) {
      const viewKey = `${key}/${view.id}`
      this.registrations.set(viewKey, { key: viewKey, module: loaded, view, signal: lifetime.signal, extension, resources, Component: () => null })
    }
    const dispose = () => {
      lifetime.abort(); extension.dispose()
      for (const view of loaded.document.views) this.registrations.delete(`${key}/${view.id}`)
      this.report(loaded, 'unloaded')
    }
    this.modules.set(key, { descriptor: loaded, controller: lifetime, extension, dispose })
    this.report(loaded, 'loaded')
    if (loaded.document.apiVersion === 2 && loaded.document.activationEvents.includes('onStartup'))
      void extension.activate().catch(error => this.report(loaded, 'failed', String(error)))
  }
  close() {
    this.catalogReady=false
    this.stopped = true
    this.generation++
    for (const module of this.modules.values()) module.dispose()
    this.modules.clear()
    this.failures.clear()
    this.registrations.clear()
    this.publish()
  }
}
function moduleKey(module: PluginUiModule) { return `${module.pluginId}/${module.componentId}` }
function fingerprint(module: PluginUiModule) { return JSON.stringify([module.revision, module.sha256, module.document, module.assets]) }
