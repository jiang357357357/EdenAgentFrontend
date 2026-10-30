import type { SharedWorkspaceClient, SharedWorkspaceStatus, SharedSpace, SharedConflict, SharedMember, SharedFile, SharedVersion, SharedDevice, SharedNetwork, SharedHost, SharedDeploymentInput, SharedSshTarget, SharedDeploymentJob } from "../../lib/shared-workspace-client"
import { assertShareConsent } from "./shared-workspace-view.ts"
import type { SharedPosture } from '../../lib/shared-workspace-client'
import { hostsInMode } from './shared-workspace-mode.ts'

export interface SharedWorkspaceState {
  posture: SharedPosture | null
  status: SharedWorkspaceStatus | null
  spaces: SharedSpace[]
  conflicts: SharedConflict[]
  members: SharedMember[]
  files: SharedFile[]
  history: SharedVersion[]
  historyFileId: string
  devices: SharedDevice[]
  memberDevices: SharedDevice[]
  hosts: SharedHost[]
  managementHostId: string
  deployment: SharedDeploymentJob | null
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
  state: SharedWorkspaceState = { posture: null, status: null, spaces: [], conflicts: [], members: [], files: [], history: [],
    historyFileId: "", devices: [], memberDevices: [], hosts: [], managementHostId: "", deployment: null, network: null, invitation: null, loading: false, busy: false, historyLoading: false, error: "", notice: "" }
  private active = true
  private epoch = 0
  private readSequence = 0
  private readsInFlight = 0
  private historySequence = 0
  private pollingDeployment = false
  private deploymentSequence = 0
  private readonly client: SharedWorkspaceClient
  private readonly publish: () => void
  private readonly filesChanged: () => void
  private readonly directoryChanged: (path: string) => void

  constructor(client: SharedWorkspaceClient, publish: () => void, filesChanged: () => void = () => {}, directoryChanged: (path: string) => void = () => {}) {
    this.client = client; this.publish = publish; this.filesChanged = filesChanged; this.directoryChanged = directoryChanged
  }
  activate() { this.active = true }
  dispose() { this.active = false; this.epoch++ }
  isCurrent = () => this.active && this.client.isCurrent()
  clearFeedback() { if (this.isCurrent()) this.update({ error: '', notice: '', invitation: null }) }
  dismissFeedback() { if (this.isCurrent()) this.update({ error: '', notice: '' }) }
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
      const posture = await this.client.posture()
      if (!current()) return
      this.update({ posture })
      const directory = await this.client.directory()
      if (!current()) return
      if (directory.path !== this.client.directoryPath) { this.directoryChanged(directory.path); return }
      const status = await this.client.status()
      if (!current()) return
      this.update({ status, error: "" })
      if (!status.available || !status.bound) this.update({ conflicts: [], members: [], files: [], history: [], historyFileId: "" })
      if (!status.available || !details) return
      const [spaces, conflicts, members, files, hosts, network] = await Promise.allSettled([
        this.client.spaces(), status.bound ? this.client.conflicts() : [],
        status.bound ? this.client.members() : [], status.bound ? this.client.files() : [], this.client.hosts(), this.client.network(),
      ])
      if (!current()) return
      this.update({
        ...(spaces.status === "fulfilled" ? { spaces: spaces.value } : {}),
        ...(conflicts.status === "fulfilled" ? { conflicts: conflicts.value } : {}),
        ...(members.status === "fulfilled" ? { members: members.value } : {}),
        ...(files.status === "fulfilled" ? { files: files.value } : {}),
        ...(hosts.status === "fulfilled" ? { hosts: hosts.value } : {}),
        ...(network.status === "fulfilled" ? { network: network.value } : {}),
      })
      const candidates = hostsInMode(this.state.hosts, posture.mode)
      const selected = candidates.find(host => host.deviceId === this.state.managementHostId)
        ?? candidates.find(host => host.local) ?? candidates[0]
      this.update({ managementHostId: selected?.deviceId ?? "" })
      const bound = this.state.spaces.find(space => space.id === status.spaceId)
      const [devices, memberDevices] = await Promise.allSettled([
        selected?.canManage && selected.reachable ? this.client.devices(selected.deviceId) : [],
        bound?.role === "owner" ? this.client.devices(bound.hostDeviceId) : [],
      ])
      if (!current()) return
      this.update({ devices: devices.status === "fulfilled" ? devices.value : [],
        memberDevices: memberDevices.status === "fulfilled" ? memberDevices.value : [] })
      const failure = [spaces, conflicts, members, files, hosts, network, devices, memberDevices].find(result => result.status === "rejected")
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

  async selectPosture(mode: SharedPosture['mode']) {
    const posture = this.state.posture
    if (!this.isCurrent() || this.state.busy || !posture || posture.mode === mode) return
    const current = this.capture()
    this.readSequence++; this.historySequence++
    this.update({ busy: true, loading: false, historyLoading: false, error: '', notice: '', invitation: null })
    try {
      const selected = await this.client.selectPosture(mode, posture.revision)
      if (!current()) return
      this.update({ posture: selected, managementHostId: '', hosts: [], spaces: [], devices: [], memberDevices: [],
        files: [], history: [], historyFileId: '', conflicts: [], members: [] })
      const directory = await this.client.directory()
      if (!current()) return
      if (directory.path !== this.client.directoryPath) { this.directoryChanged(directory.path); return }
      await this.refresh(true)
    } catch (error) { if (current()) this.update({ error: error instanceof Error ? error.message : '共享姿态切换失败' }) }
    finally { if (current()) this.update({ busy: false }) }
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

  create(name: string, hostDeviceId?: string, sourceDirectory?: string) {
    if (this.state.status?.canPublish === false) return Promise.resolve(undefined)
    return this.change(() => sourceDirectory ? this.client.create(name.trim(), hostDeviceId, sourceDirectory) : this.client.create(name.trim(), hostDeviceId),
      sourceDirectory ? '云端源目录已接入资料库；可另选本机同步目录' : "资料库已创建，尚未共享本地目录")
  }
  cloudDirectories(hostDeviceId: string, path?: string, after?: string) { return this.client.cloudDirectories(hostDeviceId, path, after) }
  createCloudDirectory(hostDeviceId: string, parent: string, name: string) { return this.client.createCloudDirectory(hostDeviceId, parent, name) }
  bindCloudSource(hostDeviceId: string, spaceId: string, path: string) {
    return this.change(() => this.client.bindCloudSource(hostDeviceId, spaceId, path), '云端源目录已绑定，请查看云端状态与冲突')
  }
  cloudSourceConflicts(hostDeviceId: string, spaceId: string) { return this.client.cloudSourceConflicts(hostDeviceId, spaceId) }
  resolveCloudSource(hostDeviceId: string, spaceId: string, conflictId: string, strategy: 'local' | 'remote') {
    return this.change(() => this.client.resolveCloudSource(hostDeviceId, spaceId, conflictId, strategy), '已处理云端源目录冲突，请核对同步状态')
  }
  cloudMembers(hostDeviceId: string, spaceId: string) { return this.client.cloudMembers(hostDeviceId, spaceId, 'list') }
  cloudMemberDevices(hostDeviceId: string) { return this.client.devices(hostDeviceId) }
  changeCloudMember(hostDeviceId: string, spaceId: string, deviceId: string, role?: 'editor' | 'viewer') {
    return this.change(() => this.client.cloudMembers(hostDeviceId, spaceId, role ? 'set' : 'remove', deviceId, role), '云端资料库权限已更新')
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
    const result = await this.change(() => this.client.invitePairing(this.state.managementHostId || undefined), "配对邀请已创建，十分钟内有效；尚未授予目录访问权限")
    if (result && this.isCurrent()) this.update({ invitation: result })
  }
  pairDevice(code: string, address?: string) { return this.change(() => this.client.pairDevice(code.trim(), address?.trim()), "设备已配对，请由资料库发布方授权共享权限") }
  connectHost(code: string, address?: string) { return this.change(() => this.client.connectHost(code.trim(), address?.trim()), "主机已连接，请由主机管理员授予资料库权限") }
  async selectHost(deviceId: string) {
    if (!this.isCurrent() || this.state.busy) return
    this.readSequence++
    this.update({ managementHostId: deviceId, invitation: null, devices: [] })
    await this.refresh(true)
  }
  sshProbe(target: SharedSshTarget) { return this.client.sshProbe(target) }
  async deployHost(input: SharedDeploymentInput) {
    const current = this.capture(), sequence = ++this.deploymentSequence
    const result = await this.client.deployHost(input)
    if (current() && sequence === this.deploymentSequence) this.update({ deployment: result })
    return result
  }
  async pollDeployment() {
    if (!this.isCurrent() || !this.state.status?.available || this.pollingDeployment) return
    this.pollingDeployment = true
    const scope = this.capture(), sequence = this.deploymentSequence
    const current = () => scope() && sequence === this.deploymentSequence
    try {
      const before = this.state.deployment, result = await this.client.deploymentStatus()
      if (!current()) return
      this.update({ deployment: result })
      if (result?.state === "succeeded" && before?.state !== "succeeded") {
        this.update({ managementHostId: result.deviceId ?? this.state.managementHostId })
        await this.refresh(true)
      }
    } catch (error) {
      if (current() && this.state.deployment?.state === "running") this.update({ error: error instanceof Error ? error.message : "部署状态读取失败" })
    } finally { this.pollingDeployment = false }
  }
  async cancelDeployment(id: string) {
    const current = this.capture(), sequence = ++this.deploymentSequence
    const result = await this.client.cancelDeployment(id)
    if (current() && sequence === this.deploymentSequence) this.update({ deployment: result })
    return result
  }
  setMember(deviceId: string, role: "editor" | "viewer") {
    return this.change(() => this.client.setMember(deviceId, role), "设备共享权限已更新")
  }
  removeMember(deviceId: string) { return this.change(() => this.client.removeMember(deviceId), "设备的资料库权限已移除") }
  revokeDevice(deviceId: string) { return this.change(() => this.client.revokeDevice(deviceId, this.state.managementHostId || undefined), "设备已从所选主机撤销") }
}
