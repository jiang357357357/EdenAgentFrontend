const assert = require("node:assert/strict")
const test = require("node:test")

const {
  combinedRendererActivityFacts,
  createActivityPresenceService,
  quotedXPropertyValues,
  readForegroundWindowFacts,
} = require("../src/activity/activity-presence.cjs")

function fakeWindow({ visible = false, focused = false } = {}) {
  return {
    isDestroyed: () => false,
    isVisible: () => visible,
    isFocused: () => focused,
  }
}

function createService(overrides = {}) {
  const powerHandlers = new Map()
  const requests = []
  const intervals = []
  const service = createActivityPresenceService({
    platform: "win32",
    environment: {},
    execFileAsync: async () => ({ stdout: "" }),
    readText: () => "",
    powerMonitor: {
      getSystemIdleTime: () => 12,
      getSystemIdleState: () => "active",
      on: (event, handler) => powerHandlers.set(event, handler),
    },
    getWindows: () => ({
      mainWindow: fakeWindow({ visible: true, focused: true }),
      petWindow: fakeWindow({ visible: true }),
      petBubbleWindow: fakeWindow(),
      petBubbleIconWindow: fakeWindow({ visible: true }),
      settingsWindow: null,
    }),
    getCurrentViewMode: () => "character",
    coreRequest: async (...args) => { requests.push(args); return {} },
    authHeader: (token) => ({ Authorization: `Bearer ${token}` }),
    isQuitting: () => false,
    now: () => new Date("2026-08-02T00:00:00.000Z"),
    setIntervalFn: (callback, interval) => {
      const timer = { callback, interval, unrefCalled: false, unref() { this.unrefCalled = true } }
      intervals.push(timer)
      return timer
    },
    clearIntervalFn: () => {},
    ...overrides,
  })
  return { intervals, powerHandlers, requests, service }
}

test("extracts quoted X11 property values", () => {
  assert.deepEqual(quotedXPropertyValues('WM_CLASS = "code", "Code"'), ["code", "Code"])
})

test("reads active X11 window facts", async () => {
  const calls = []
  const result = await readForegroundWindowFacts({
    platform: "linux",
    environment: { XDG_SESSION_TYPE: "x11" },
    execFileAsync: async (_file, args) => {
      calls.push(args)
      if (args[0] === "-root") return { stdout: "_NET_ACTIVE_WINDOW: window id # 0x123" }
      return {
        stdout: [
          "_NET_WM_PID(CARDINAL) = 42",
          'WM_CLASS(STRING) = "code", "Code"',
          '_NET_WM_NAME(UTF8_STRING) = "Mon"',
          "_NET_WM_STATE(ATOM) = _NET_WM_STATE_FULLSCREEN",
        ].join("\n"),
      }
    },
    readText: (filePath) => filePath === "/proc/42/comm" ? "electron\n" : "",
  })

  assert.equal(calls.length, 2)
  assert.deepEqual(result, {
    available: true,
    application_name: "Code",
    process_name: "electron",
    window_title: "Mon",
    fullscreen: true,
    error: "",
  })
})

test("combines renderer facts and keeps the latest interaction", () => {
  const facts = combinedRendererActivityFacts(new Map([
    [1, { chat_input_focused: true, last_user_interaction_at: "2026-08-01T10:00:00Z" }],
    [2, { voice_recording: true, tts_playing: true, last_user_interaction_at: "2026-08-01T11:00:00Z" }],
  ]))
  assert.deepEqual(facts, {
    chat_input_focused: true,
    voice_recording: true,
    tts_playing: true,
    last_user_interaction_at: "2026-08-01T11:00:00Z",
  })
})

test("collects Electron window, input and renderer facts", async () => {
  const { service } = createService()
  service.updateRendererActivityFacts({ id: 7, isDestroyed: () => false }, {
    surface: "main",
    chat_input_focused: true,
    last_user_interaction_at: "2026-08-02T00:00:00Z",
  })

  const payload = await service.collectActivityPresenceFacts()
  assert.equal(payload.system_input.idle_seconds, 12)
  assert.equal(payload.monagent.main_window_visible, true)
  assert.equal(payload.monagent.main_window_focused, true)
  assert.equal(payload.monagent.pet_visible, true)
  assert.equal(payload.monagent.bubble_visible, true)
  assert.equal(payload.monagent.chat_input_focused, true)
  assert.equal(payload.recent_events[0].type, "monagent_interaction_updated")
})

test("starting activity presence schedules and publishes authenticated updates", async () => {
  const { intervals, requests, service } = createService()
  service.startActivityPresence("token-1", "client-1")
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(intervals.length, 1)
  assert.equal(intervals[0].interval, 60_000)
  assert.equal(intervals[0].unrefCalled, true)
  assert.equal(requests.length, 1)
  assert.equal(requests[0][0], "/api/users/me/activity-presence/")
  assert.equal(requests[0][1].headers.Authorization, "Bearer token-1")
  assert.equal(requests[0][1].headers["X-MON-CLIENT-ID"], "client-1")

  service.stopActivityPresence()
  assert.equal(await service.publishActivityPresence(), false)
})

test("power monitor events update suspended state", async () => {
  const { powerHandlers, service } = createService()
  service.startActivityPresenceSystemEvents()
  powerHandlers.get("suspend")()
  assert.equal((await service.collectActivityPresenceFacts()).session.suspended, true)
  powerHandlers.get("resume")()
  assert.equal((await service.collectActivityPresenceFacts()).session.suspended, false)
})
