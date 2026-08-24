import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [appSource, pageSource, authSource, runtimeHookSource, transportSource, clientSource, generatedSource, sidebarSource, chatPageSource, configurationPageSource, localCharacterSource] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/origin/OriginSelectionPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/hooks/useSessionRuntime.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/rpc-transport.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/agent-client.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/generated/mon-agent-rpc.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/layout/Sidebar.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/chat/ChatPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/configuration/ConfigurationPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/local-character.ts", import.meta.url), "utf8"),
])

test("main windows choose an origin before Core authentication", () => {
  const renderSource = appSource.slice(appSource.lastIndexOf("\n  if (runtimeOrigin === null)"))
  assert.match(appSource, /const runtimeReady = authStatus === "authenticated" && \(isAuxiliaryWindow \|\| runtimeOrigin !== null\)/)
  assert.match(appSource, /useSessionRuntime\(runtimeReady,/)
  assert.match(renderSource, /if \(runtimeOrigin === null\)/)
  assert.match(renderSource, /<OriginSelectionPage key="runtime-origin" onSelect=\{handleRuntimeOriginSelect\}/)
  assert.ok(renderSource.indexOf("if (runtimeOrigin === null)") < renderSource.indexOf('if (authStatus === "checking")'))
  assert.ok(renderSource.indexOf('if (authStatus === "checking")') < renderSource.indexOf('if (authStatus !== "authenticated")'))
})

test("origin choice presents the two explicit runtime destinations", () => {
  assert.match(pageSource, /你来自哪里？/)
  assert.match(pageSource, /name: "伊甸园"[\s\S]*?action: "连接 Mon"/)
  assert.match(pageSource, /name: "尘世"[\s\S]*?action: "本地部署"/)
  assert.match(pageSource, /aria-pressed=\{isSelected\}/)
  assert.match(pageSource, /event\.key === "Enter" && selected/)
})

test("logging out clears the origin so the next login asks again", () => {
  assert.match(authSource, /export function clearAuth\(options:[\s\S]*?if \(!options\.preserveRuntimeOrigin\) clearRuntimeOrigin\(\)/)
})

test("the sidebar configuration button opens local runtime configuration", () => {
  assert.match(sidebarSource, /ActivityButton label="配置"[\s\S]*?onClick=\{onOpenConfiguration\}/)
  assert.match(chatPageSource, /onOpenConfiguration=\{onOpenConfiguration\}/)
  assert.match(appSource, /const handleOpenConfiguration = \(\) => \{[\s\S]*?setActivePage\("configuration"\)/)
  assert.match(appSource, /onOpenConfiguration=\{handleOpenConfiguration\}/)
  assert.match(configurationPageSource, /尘世配置/)
  assert.match(configurationPageSource, /saveLocalRuntimeConfig\(form\)/)
  assert.match(configurationPageSource, /testLocalRuntimeConfig\(form\)/)
  assert.match(configurationPageSource, /label: "角色配置"/)
  assert.match(configurationPageSource, /saveLocalCharacterConfig\(snapshot\)/)
})

test("the selected origin is negotiated with the Rust server", () => {
  assert.match(generatedSource, /runtimeOrigin: RuntimeOrigin/)
  assert.match(generatedSource, /runtimeOrigin: RuntimeOrigin = "mon"/)
  assert.match(transportSource, /next\.connect\(websocketUrl, token, "dev", requestedOrigin\)/)
  assert.match(transportSource, /connectedOrigin !== requestedOrigin/)
})

test("local mode uses the environment model and local identity without Core lookups", () => {
  assert.match(appSource, /if \(runtimeOrigin === "local"\)[\s\S]*?setAuthStatus\("authenticated"\)/)
  assert.match(runtimeHookSource, /const isRuntimeReady = useCallback\(\(\) => enabled, \[enabled\]\)/)
  assert.match(appSource, /if \(runtimeOrigin === "local"\)[\s\S]*?setCurrentAssistant\(localAssistant\)/)
  assert.match(clientSource, /getStoredRuntimeOrigin\(\) === "local"[\s\S]*?assistantName: localCharacter\.name/)
  assert.match(clientSource, /getStoredRuntimeOrigin\(\) === "local"[\s\S]*?rpcRequest\("model\.read"/)
  assert.match(clientSource, /本地模式的模型由 MON_AGENT_MODEL 配置/)
  assert.match(clientSource, /profile: localCharacterParticipantProfile\(localCharacter\)/)
  assert.match(localCharacterSource, /system_prompt: normalized\.systemPrompt/)
  assert.match(appSource, /updateSessionParticipants\(\[LOCAL_ASSISTANT_ID\]\)/)
})
