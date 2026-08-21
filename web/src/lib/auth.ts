export interface AuthUser {
  id: number
  username: string
  display_name?: string | null
  avatar_url?: string | null
  environment?: UserEnvironment | null
  ws_session_id?: string | null
  is_staff: boolean
  is_superuser: boolean
  date_joined?: string
  last_login?: string | null
}

export interface UserEnvironmentLocation {
  country?: string
  region?: string
  city?: string
  district?: string
  latitude?: number
  longitude?: number
  accuracy?: number
  source?: string
  updated_at?: string
}

export interface UserEnvironment {
  timezone?: string
  locale?: string
  location?: UserEnvironmentLocation
}

export interface UserProfileUpdateInput {
  display_name?: string | null
  avatar_url?: string | null
  background_image_url?: string | null
  user_tags?: string[]
  personality_tag?: string | null
  personality_tag_author?: string | null
  current_world_id?: number | null
  environment?: UserEnvironment
}

export interface LoginResponse {
  message: string
  user: AuthUser
  token: string
  expires_at: string
  expires_in: number
}

export interface CoreTTSSynthesisResponse {
  success: boolean
  audio_url?: string | null
  text?: string
  error_message?: string | null
  cached?: boolean
  cache_key?: string | null
  audio_format?: string | null
  duration_ms?: number | null
  size_bytes?: number | null
}

export interface VerifyTokenResponse {
  valid: boolean
  user: AuthUser
  token_info?: {
    valid: boolean
    user: string
    created_at: string
    expires_at: string
    remaining_hours: number
  }
}

export interface CoreCharacterVisualAction {
  id?: number
  character_id?: number
  name?: string
  intent?: string
  aliases?: string[]
  description?: string
  static_image_url?: string | null
  dynamic_preview_url?: string | null
  dynamic_fps?: number
  dynamic_loop?: boolean
  dynamic_frames?: Array<{
    id?: number
    file_url?: string | null
  }>
  spine_animation?: string
  spine_track?: number
  spine_loop?: boolean
  spine_mix_ms?: number
  spine_sync_animations?: CoreSpineSyncAnimation[]
  spine_reset_to_idle?: boolean
  spine_variants?: Record<string, Partial<Record<"standee" | "memory-lobby", CoreSpineAction>>>
  spine?: CoreSpineAction | null
  has_spine?: boolean
  priority?: number
  action_key?: string
  action_label?: string
  enabled?: boolean
}

export interface CoreSpineSyncAnimation {
  animation: string
  track?: number
  loop?: boolean
}

export interface CoreSpineAction {
  animation: string
  track?: number
  loop?: boolean
  mix_ms?: number
  sync?: CoreSpineSyncAnimation[]
  reset_to_idle?: boolean
}

export interface CoreCharacterSpineAsset {
  id?: number
  character_id?: number
  costume_id?: number
  costume_key?: string
  skeleton_url: string
  atlas_url: string
  textures: Array<{
    id?: number
    page_name: string
    file_url: string
  }>
  runtime_version?: string
  default_skin?: string
  idle_animation?: string
  scale?: number
  offset_x?: number
  offset_y?: number
  enabled?: boolean
  layout: "standee" | "memory-lobby"
  metadata?: Record<string, unknown>
}

export interface CoreCharacterCostume {
  id: number
  character_id?: number
  costume_id: string
  name: string
  description?: string
  avatar_url?: string | null
  is_default: boolean
  enabled: boolean
  sort_order?: number
  spine_assets?: CoreCharacterSpineAsset[]
}

export interface CoreCharacterVisualActionGroup {
  id?: number
  character_id?: number
  name?: string
  trigger?: string
  selection_mode?: string
  cooldown_ms?: number
  priority?: number
  enabled?: boolean
  items?: Array<{
    id?: number
    action?: CoreCharacterVisualAction
    weight?: number
    priority?: number
    enabled?: boolean
  }>
}

export interface ActiveCharacterAction {
  characterID?: number | string | null
  characterName?: string
  action?: CoreCharacterVisualAction
  group?: CoreCharacterVisualActionGroup | null
  imageUrl?: string
  reason?: string
  source?: string
  motion?: "none" | "jump" | "approach" | "retreat" | "shake" | "bounce" | "float" | "tremble" | "vertical_shake" | "sink" | "emphasize" | string
  effect?: "none" | "question" | "exclamation" | "sweat" | "heart" | "anger" | "sigh" | "speechless" | "gloomy" | "sleepy" | string
  intensity?: "light" | "normal" | "strong" | string
  effectAnchor?: "head_left" | "head_right" | "above" | "body_left" | "body_right" | string
  performanceID?: string
  time?: number
}

export interface CoreCharacter {
  id: number
  name: string
  description?: string | null
  personality?: unknown
  setting_summary?: unknown
  ai_talk_entity_id?: number | null
  ai_talk_entity_name?: string | null
  avatar_url?: string | null
  default_standing_image_url?: string | null
  visual_actions?: CoreCharacterVisualAction[]
  visual_action_groups?: CoreCharacterVisualActionGroup[]
  costumes?: CoreCharacterCostume[]
  default_costume_id?: string | null
  spine_asset?: CoreCharacterSpineAsset | null
  spine_assets?: CoreCharacterSpineAsset[]
  visual_preference?: "static" | "dynamic" | "spine" | string | null
  default_visual_action_id?: number | null
  tts_config_id?: number | null
  tts_config_name?: string | null
  stt_config_id?: number | null
  stt_config_name?: string | null
  signature?: string | null
}

export interface CoreAssistant {
  id: number
  name: string
  character_id?: number | null
  character?: CoreCharacter | null
  is_default: boolean
  is_assistant_mode: boolean
  visual_costume_id?: number | null
  visual_layout?: "standee" | "memory-lobby"
  devices?: unknown[]
  created_at?: string
  updated_at?: string
}

declare const __MON_AUTH_MODE__: string | undefined

const browserCoreBaseUrl = (import.meta as unknown as { env?: { DEV?: boolean; VITE_CORE_BASE_URL?: string } }).env?.DEV
  ? "/core-api"
  : ((import.meta as unknown as { env?: { VITE_CORE_BASE_URL?: string } }).env?.VITE_CORE_BASE_URL ??
    "http://127.0.0.1:40011")

const TOKEN_KEY = "agent.auth_token"
const USER_KEY = "agent.auth_user"
const EXPIRES_KEY = "agent.auth_expires_at"
const CLIENT_ID_KEY = "agent.client_id"
const assistantDetailCache = new Map<string, CoreAssistant>()
const assistantDetailRequests = new Map<string, Promise<CoreAssistant>>()
const assistantListRequests = new Map<string, Promise<CoreAssistant[]>>()

function assistantCacheKey(token: string, assistantId: number) {
  return `${token}:${assistantId}`
}

function clearAssistantRequestCaches() {
  assistantDetailCache.clear()
  assistantDetailRequests.clear()
  assistantListRequests.clear()
}

function randomClientSuffix() {
  const webCrypto = globalThis.crypto

  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID()
  }

  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    webCrypto.getRandomValues(bytes)
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function getClientMetadata() {
  const clientType = isDesktopRuntime() ? "agent_desktop" : "agent_web"
  let clientId = window.localStorage.getItem(CLIENT_ID_KEY)
  if (!clientId) {
    clientId = `mon-${clientType}:${randomClientSuffix()}`
    window.localStorage.setItem(CLIENT_ID_KEY, clientId)
  }

  return {
    client_id: clientId,
    client_type: clientType,
    clientId,
    clientType,
  }
}

export function getClientId() {
  return getClientMetadata().clientId
}

function parseExpiresAt(value: string | null) {
  if (!value) return undefined
  const normalized = value
    .trim()
    .replace(" ", "T")
    .replace(/\.(\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}|$)/, ".$1")
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function parseJsonSafely<T>(text: string) {
  if (!text) return undefined
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

export function getErrorMessage(error: unknown, fallback = "请求失败") {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === "string" && error.trim()) {
    return error
  }

  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error?: unknown; cause?: unknown }
    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return candidate.message
    }
    if (typeof candidate.error === "string" && candidate.error.trim()) {
      return candidate.error
    }
    if (typeof candidate.cause === "string" && candidate.cause.trim()) {
      return candidate.cause
    }
  }

  return fallback
}

export function isAuthExpiredError(error: unknown) {
  const message = getErrorMessage(error, "")
  return /authentication_expired|core_authentication_expired|not_authenticated|token无效|登录已失效/i.test(message)
}

function isDesktopRuntime() {
  return Boolean(window.monAgentDesktop)
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>) {
  const bridge = window.monAgentDesktop
  if (!bridge) {
    throw new Error("MonAgent 桌面桥接不可用")
  }
  return bridge.invoke<T>(command, args)
}

function mergeUserProfile(user: AuthUser, profile?: Partial<AuthUser> | null): AuthUser {
  if (!profile) return user
  return {
    ...user,
    display_name: profile.display_name ?? user.display_name,
    avatar_url: profile.avatar_url ?? user.avatar_url,
    environment: profile.environment ?? user.environment,
  }
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${browserCoreBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...init?.headers,
    },
  })

  const text = await response.text().catch(() => "")
  const data = parseJsonSafely<T & { error?: string; message?: string }>(text)

  if (!response.ok) {
    const errorMessage =
      (data && typeof data === "object" && "error" in data && data.error) ||
      (data && typeof data === "object" && "message" in data && data.message) ||
      `${response.status} ${response.statusText}`
    throw new Error(String(errorMessage))
  }

  return data as T
}

export function requestCore<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken()
  if (!token) return Promise.reject(new Error("not_authenticated: Core token missing"))
  return request<T>(path, init, token)
}

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY)
}

export async function resolveCoreBaseUrl() {
  if (isDesktopRuntime()) {
    return (await invokeDesktop<string>("resolve_core_base_url_command")).replace(/\/$/, "")
  }

  return new URL(browserCoreBaseUrl, window.location.origin).toString().replace(/\/$/, "")
}

export function getStoredTokenExpiresAt() {
  return parseExpiresAt(window.localStorage.getItem(EXPIRES_KEY))
}

export function isStoredTokenExpired(skewMs = 15_000) {
  const expiresAt = getStoredTokenExpiresAt()
  return typeof expiresAt === "number" && expiresAt <= Date.now() + skewMs
}

export function getAuthMode(): "development" | "production" {
  if (typeof __MON_AUTH_MODE__ !== "undefined" && __MON_AUTH_MODE__ === "development") {
    return "development"
  }
  return "production"
}

export function getStoredUser() {
  const raw = window.localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function clearAuth() {
  clearAssistantRequestCaches()
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
  window.localStorage.removeItem(EXPIRES_KEY)
}

export function saveAuth(payload: { token: string; user: AuthUser; expiresAt?: string }) {
  window.localStorage.setItem(TOKEN_KEY, payload.token)
  window.localStorage.setItem(USER_KEY, JSON.stringify(payload.user))
  if (payload.expiresAt) {
    window.localStorage.setItem(EXPIRES_KEY, payload.expiresAt)
  } else {
    window.localStorage.removeItem(EXPIRES_KEY)
  }
}

export async function loginWithCore(username: string, password: string) {
  const client = getClientMetadata()

  if (isDesktopRuntime()) {
    const response = await invokeDesktop<LoginResponse>("core_login", {
      request: {
        username,
        password,
        clientId: client.clientId,
        clientType: client.clientType,
      },
    })
    const profile = await fetchUserProfile(response.token).catch(() => null)
    const user = mergeUserProfile(response.user, profile)
    saveAuth({
      token: response.token,
      user,
      expiresAt: response.expires_at,
    })
    return { ...response, user }
  }

  const response = await request<LoginResponse>("/api/users/login/", {
    method: "POST",
    body: JSON.stringify({
      username,
      password,
      client_id: client.client_id,
      client_type: client.client_type,
    }),
    headers: {
      "X-MON-CLIENT-ID": client.client_id,
      "X-MON-CLIENT-TYPE": client.client_type,
    },
  })

  const profile = await fetchUserProfile(response.token).catch(() => null)
  const user = mergeUserProfile(response.user, profile)

  saveAuth({
    token: response.token,
    user,
    expiresAt: response.expires_at,
  })

  return { ...response, user }
}

export async function verifyTokenWithCore(token: string) {
  if (isDesktopRuntime()) {
    const client = getClientMetadata()
    const response = await invokeDesktop<VerifyTokenResponse>("core_verify_token", {
      token,
      clientId: client.clientId,
    })
    if (!response.valid) {
      throw new Error("Token无效")
    }
    const profile = await fetchUserProfile(token).catch(() => null)
    const user = mergeUserProfile(response.user, profile)
    saveAuth({
      token,
      user,
      expiresAt: response.token_info?.expires_at,
    })
    return { ...response, user }
  }

  const response = await request<VerifyTokenResponse>("/api/users/verify-token/", { method: "GET" }, token)
  if (!response.valid) {
    throw new Error("Token无效")
  }
  const profile = await fetchUserProfile(token).catch(() => null)
  const user = mergeUserProfile(response.user, profile)
  saveAuth({
    token,
    user,
    expiresAt: response.token_info?.expires_at,
  })
  return { ...response, user }
}

export async function fetchUserProfile(token: string) {
  if (isDesktopRuntime()) {
    return invokeDesktop<AuthUser>("core_user_profile", { token })
  }

  return request<AuthUser>("/api/users/me/profile/", { method: "GET" }, token)
}

export async function updateUserProfile(token: string, input: UserProfileUpdateInput) {
  if (isDesktopRuntime()) {
    return invokeDesktop<AuthUser>("core_update_user_profile", { token, input })
  }

  return request<AuthUser>(
    "/api/users/me/profile/",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token,
  )
}

export async function fetchDefaultAssistant(token: string) {
  if (isDesktopRuntime()) {
    return invokeDesktop<CoreAssistant>("core_default_assistant", { token })
  }

  return request<CoreAssistant>("/api/assistants/default/", { method: "GET" }, token)
}

export async function fetchCurrentAssistant(token: string) {
  const assistant = isDesktopRuntime()
    ? await invokeDesktop<CoreAssistant>("core_current_assistant", { token })
    : await request<CoreAssistant>("/api/assistants/current/", { method: "GET" }, token)
  assistantDetailCache.set(assistantCacheKey(token, assistant.id), assistant)
  return assistant
}

export async function fetchAssistants(token: string, options: { summary?: boolean } = {}) {
  const summary = options.summary === true
  const requestKey = `${token}:${summary ? "summary" : "full"}`
  const existing = assistantListRequests.get(requestKey)
  if (existing) return existing

  const pending = (async () => {
    const path = summary ? "/api/assistants/?summary=1" : "/api/assistants/"
    const payload = isDesktopRuntime()
      ? await invokeDesktop<CoreAssistant[] | { results?: CoreAssistant[] }>("core_list_assistants", { token, summary })
      : await request<CoreAssistant[] | { results?: CoreAssistant[] }>(path, { method: "GET" }, token)

    return Array.isArray(payload) ? payload : Array.isArray(payload.results) ? payload.results : []
  })()
  assistantListRequests.set(requestKey, pending)
  try {
    return await pending
  } finally {
    if (assistantListRequests.get(requestKey) === pending) assistantListRequests.delete(requestKey)
  }
}

export async function fetchAssistant(token: string, assistantId: number, options: { refresh?: boolean } = {}) {
  const requestKey = assistantCacheKey(token, assistantId)
  if (!options.refresh) {
    const cached = assistantDetailCache.get(requestKey)
    if (cached) return cached
    const existing = assistantDetailRequests.get(requestKey)
    if (existing) return existing
  }

  const pending = isDesktopRuntime()
    ? invokeDesktop<CoreAssistant>("core_get_assistant", { token, assistantId })
    : request<CoreAssistant>(`/api/assistants/${assistantId}/`, { method: "GET" }, token)
  assistantDetailRequests.set(requestKey, pending)
  try {
    const assistant = await pending
    assistantDetailCache.set(requestKey, assistant)
    return assistant
  } finally {
    if (assistantDetailRequests.get(requestKey) === pending) assistantDetailRequests.delete(requestKey)
  }
}

function cacheAssistantDetail(token: string, assistant: CoreAssistant) {
  assistantDetailCache.set(assistantCacheKey(token, assistant.id), assistant)
  return assistant
}

export async function setCurrentAssistant(token: string, assistantId: number) {
  const input = {
    current_assistant: assistantId,
  }

  if (isDesktopRuntime()) {
    await invokeDesktop("core_update_agent_settings", {
      token,
      input,
    })
    return fetchCurrentAssistant(token)
  }

  await request(
    "/api/agent/settings/my/",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token,
  )
  return fetchCurrentAssistant(token)
}

export async function updateAssistantAppearance(
  token: string,
  assistantId: number,
  input: {
    visual_costume_id: number
    visual_layout: "standee" | "memory-lobby"
  },
) {
  if (isDesktopRuntime()) {
    const assistant = await invokeDesktop<CoreAssistant>("core_update_assistant", {
      token,
      assistantId,
      input,
    })
    return cacheAssistantDetail(token, assistant)
  }

  const assistant = await request<CoreAssistant>(
    `/api/assistants/${assistantId}/`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token,
  )
  return cacheAssistantDetail(token, assistant)
}

export function resolveCoreAssetUrl(url?: string | null) {
  if (!url) return undefined
  if (/^(data:|blob:|https?:\/\/)/i.test(url)) return url
  if (url.startsWith("/")) return `${browserCoreBaseUrl}${url}`
  return url
}

export async function logoutWithCore(token: string | null) {
  if (!token) {
    clearAuth()
    return
  }

  try {
    if (isDesktopRuntime()) {
      await invokeDesktop<{ message: string }>("core_logout", { token })
      return
    }
    await request<{ message: string }>("/api/users/logout/", { method: "POST" }, token)
  } finally {
    clearAuth()
  }
}

export interface DevAccount {
  username: string
  password: string
}

export async function getDevAccount(): Promise<DevAccount | null> {
  if (!isDesktopRuntime()) return null
  return invokeDesktop<DevAccount | null>("get_dev_account")
}
