import type { SharedWorkspaceClient, SharedWorkspaceStatus, SharedSpace, SharedConflict, SharedMember, SharedFile, SharedVersion, SharedDevice, SharedNetwork } from "../../lib/shared-workspace-client"
import { assertShareConsent } from "./shared-workspace-view.ts"

export interface SharedWorkspaceState {
  status: SharedWorkspaceStatus | null
  spaces: SharedSpace[]
  conflicts: SharedConflict[]
  members: SharedMember[]
  files: SharedFile[]
  history: SharedVersion[]
  historyFileId: string
  devices: SharedDevice[]
  network: SharedNetwork | null
  invitation: { code: string; expiresAt: number } | null
  loading: boolean
  busy: boolean
  historyLoading: boolean
  error: string
  notice: string
}

/** Late reads and decisions are discarded when the view's account/world/session/directory changes. */
export class SharedWorkspaceStateOwner {
  state: SharedWorkspaceState = { status: null, spaces: [], conflicts: [], members: [], files: [], history: [],
    historyFileId: "", devices: [], network: null, invitation: null, loading: false, busy: false, historyLoading: false, error: "", notice: "" }
  private active = true
  private epoch = 0
  private readSequence = 0
  private readsInFlight = 0
  private historySequence = 0
  private readonly client: SharedWorkspaceClient
  private readonly publish: () => void
  private readonly filesChanged: () => void

  constructor(client: SharedWorkspaceClient, publish: () => void, filesChanged: () => void = () => {}) {
    this.client = client; this.publish = publish; this.filesChanged = filesChanged
  }
  activate() { this.active = true }
  dispose() { this.active = false; this.epoch++ }
  isCurrent = () => this.active && this.client.isCurrent()
  private capture() { const epoch = this.epoch; return () => this.isCurrent() && epoch === this.epoch }
  private update(values: Partial<SharedWorkspaceState>) { this.state = { ...this.state, ...values }; this.publish() }

  async refresh(details = false, mode: "foreground" | "background" = "foreground"): Promise<void> {
    const background = mode === "background"
    if (!this.isCurrent()) return
    if (background && (this.readsInFlight > 0 || this.state.busy || this.state.loading)) return
    const showLoading = !background || !this.state.status
    this.readsInFlight++
    const scope = this.capture(), sequence = ++this.readSequence
    const current = () => scope() && sequence === this.readSequence
    if (showLoading && (details || !this.state.status)) this.update({ loading: true, error: "" })
    try {
      const status = await this.client.status()
      if (!current()) return
      this.update({ status, error: "" })
      if (!status.available || !status.bound) this.update({ conflicts: [], members: [], files: [], history: [], historyFileId: "" })
      if (!status.available || !details) return
      const [spaces, conflicts, members, files, devices, network] = await Promise.allSettled([
        this.client.spaces(), status.bound ? this.client.conflicts() : [],
        status.bound ? this.client.members() : [], status.bound ? this.client.files() : [], this.client.devices(), this.client.network(),
      ])
      if (!current()) return
      this.update({
        ...(spaces.status === "fulfilled" ? { spaces: spaces.value } : {}),
        ...(conflicts.status === "fulfilled" ? { conflicts: conflicts.value } : {}),
        ...(members.status === "fulfilled" ? { members: members.value } : {}),
        ...(files.status === "fulfilled" ? { files: files.value } : {}),
        ...(devices.status === "fulfilled" ? { devices: devices.value } : {}),
        ...(network.status === "fulfilled" ? { network: network.value } : {}),
      })
      const failure = [spaces, conflicts, members, files, devices, network].find(result => result.status === "rejected")
      if (failure?.status === "rejected") throw failure.reason
    } catch (reason) {
      if (current()) this.update({ error: reason instanceof Error ? reason.message : "无法读取共享资料库" })
    } finally {
      this.readsInFlight--
      if (current() && showLoading) this.update({ loading: false })
    }
  }

  async loadHistory(fileId: string): Promise<void> {
    if (!this.isCurrent() || this.state.busy) return
    const scope = this.capture(), sequence = ++this.historySequence
    const current = () => scope() && sequence === this.historySequence
    this.update({ historyFileId: fileId, history: [], historyLoading: Boolean(fileId), error: "" })
    if (!fileId) return
    try {
      const history = await this.client.history(fileId)
      if (current()) this.update({ history })
    } catch (reason) {
      if (current()) this.update({ error: reason instanceof Error ? reason.message : "无法读取历史版本" })
    } finally { if (current()) this.update({ historyLoading: false }) }
  }

  private async change<T>(work: () => Promise<T>, notice: string): Promise<T | undefined> {
    if (!this.isCurrent() || this.state.busy || !this.state.status?.available) return undefined
    const current = this.capture()
    this.readSequence++
    this.historySequence++
    this.update({ busy: true, error: "", notice: "", historyLoading: false })
    try {
      const result = await work()
      if (!current()) return undefined
      this.update({ notice })
      await this.refresh(true)
      return current() ? result : undefined
    } catch (reason) {
      if (current()) this.update({ error: reason instanceof Error ? reason.message : "共享资料库操作失败" })
      return undefined
    } finally { if (current()) this.update({ busy: false }) }
  }

  create(name: string) {
    if (this.state.status?.canPublish === false) return Promise.resolve(undefined)
    return this.change(() => this.client.create(name.trim()), "资料库已创建，尚未共享本地目录")
  }
  async bind(spaceId: string, selectedRoot: string, confirmed: boolean) {
    if (!this.isCurrent()) return
    try { assertShareConsent(this.state.status?.root ?? "", selectedRoot, confirmed) }
    catch (reason) { this.update({ error: (reason as Error).message }); return }
    await this.change(() => this.client.bind(spaceId), "目录已绑定，可手动同步并查看结果")
  }
  async sync() {
    const result = await this.change(() => this.client.sync(), "已检查同步状态，请查看结果与冲突")
    if (result && this.isCurrent()) this.filesChanged()
    return result
  }
  pause(paused: boolean) { return this.change(() => this.client.pause(paused), paused ? "自动同步已暂停" : "自动同步已恢复") }
  async resolve(conflictId: string, strategy: "local" | "remote") {
    const result = await this.change(() => this.client.resolve(conflictId, strategy), "已提交冲突处理，请检查同步状态；被替换的本地版本由同步服务保留备份")
    if (result && this.isCurrent()) this.filesChanged()
    return result
  }
  async restore(fileId: string, revision: number) {
    const result = await this.change(() => this.client.restore(fileId, revision), "已请求恢复历史版本，请同步并检查文件状态")
    if (result && this.isCurrent()) { this.filesChanged(); await this.loadHistory(fileId) }
    return result
  }
  async invitePairing() {
    const result = await this.change(() => this.client.invitePairing(), "配对邀请已创建，十分钟内有效；尚未授予目录访问权限")
    if (result && this.isCurrent()) this.update({ invitation: result })
  }
  pairDevice(code: string, address?: string) { return this.change(() => this.client.pairDevice(code.trim(), address?.trim()), "设备已配对，请由资料库发布方授权共享权限") }
  setMember(deviceId: string, role: "editor" | "viewer") {
    return this.change(() => this.client.setMember(deviceId, role), "设备共享权限已更新")
  }
  removeMember(deviceId: string) { return this.change(() => this.client.removeMember(deviceId), "设备的资料库权限已移除") }
  revokeDevice(deviceId: string) { return this.change(() => this.client.revokeDevice(deviceId), "设备已撤销，此设备将无法继续同步") }
}
