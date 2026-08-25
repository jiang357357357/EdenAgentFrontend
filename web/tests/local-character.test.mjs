import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [characterSource, configurationSource, clientSource, desktopWindowSource] = await Promise.all([
  readFile(new URL("../src/lib/local-character.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/configuration/ConfigurationPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/agent-client.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/desktop-window.ts", import.meta.url), "utf8"),
])

test("local character visuals map to the existing renderer contract", () => {
  assert.match(characterSource, /default_standing_image_url: standingImageUrl/)
  assert.match(characterSource, /visual_preference: normalized\.visualPreference/)
  assert.match(characterSource, /spine_assets: spineAsset \? \[spineAsset\] : \[\]/)
  assert.match(characterSource, /costume_id: LOCAL_COSTUME_KEY/)
  assert.match(characterSource, /default_costume_id: spineAsset \? LOCAL_COSTUME_KEY : null/)
  assert.match(characterSource, /skeleton_url: resolveDesktopFileUrl\(normalized\.spine\.skeletonPath\)/)
  assert.match(clientSource, /standingImageUrl = resolveDesktopFileUrl\(localCharacter\.standingImagePath\)/)
})

test("the browser fallback mirrors the complete Arona default profile", () => {
  assert.match(characterSource, /name: "阿罗娜"/)
  assert.match(characterSource, /aliases: \["Arona", "A\.R\.O\.N\.A", "什亭之匣主 OS"\]/)
  assert.match(characterSource, /worldNames: \["基沃托斯", "什亭之匣", "夏莱"\]/)
  assert.match(characterSource, /userAddress: "老师"/)
  assert.match(characterSource, /initiativeLevel: "proactive"/)
  assert.match(characterSource, /systemPrompt: "你是阿罗娜/)
  assert.match(characterSource, /LOCAL_CHARACTER_STORAGE_VERSION = 6/)
  assert.match(characterSource, /migrateStoredCharacter/)
  assert.match(characterSource, /avatarPath: ""/)
  assert.match(characterSource, /standingImagePath: ""/)
  assert.match(characterSource, /visualPreference: "static"/)
  assert.match(characterSource, /spine: null/)
  assert.match(characterSource, /removeLegacyBundledAssets/)
  assert.match(desktopWindowSource, /https\?:\\\/\\\/\|data:\|blob:\|edenagent-file:/)
  assert.match(desktopWindowSource, /bridge\?\.convertFileSrc\?\.\(filePath\) \?\? filePath/)
})

test("configuration exposes dedicated static and Spine import controls", () => {
  assert.match(configurationSource, /selectDesktopCharacterStandingImage\(\)/)
  assert.match(configurationSource, /selectDesktopCharacterSpineDirectory\(\)/)
  assert.match(configurationSource, /Spine 4\.2/)
  assert.match(configurationSource, /<CharacterVisualRenderer/)
})

test("the complete local character dossier is editable and persisted into the participant profile", () => {
  for (const field of [
    "background", "appearance", "worldNames", "values", "userRelationship",
    "relationshipBoundaries", "goals", "decisionPrinciples", "initiativeLevel",
    "memoryPreferences", "behavioralRules", "speechStyle", "exampleDialogue",
    "voiceStyle",
  ]) {
    assert.match(characterSource, new RegExp(`${field}:`))
  }
  assert.match(configurationSource, /身份与世界观/)
  assert.match(configurationSource, /人格与内在/)
  assert.match(configurationSource, /与用户及社会关系/)
  assert.match(configurationSource, /目标、职责与行为/)
  assert.match(configurationSource, /表达与声音/)
  assert.match(configurationSource, /高级角色指令/)
  assert.match(configurationSource, /normalizeLocalCharacter\(next\.character\)/)
})

test("character configuration expands into three dedicated views", () => {
  assert.match(configurationSource, /type CharacterConfigurationView = "basic" \| "complete" \| "visual"/)
  assert.match(configurationSource, /id: "basic", label: "基本信息"/)
  assert.match(configurationSource, /id: "complete", label: "完整角色"/)
  assert.match(configurationSource, /id: "visual", label: "视觉资源"/)
  assert.match(configurationSource, /aria-expanded=\{characterMenuOpen\}/)
  assert.match(configurationSource, /characterView === "basic"/)
  assert.match(configurationSource, /characterView === "complete"/)
  assert.match(configurationSource, /characterView === "visual"/)
})

test("character edits are debounced and saved automatically without a manual action bar", () => {
  assert.match(configurationSource, /window\.setTimeout\(\(\) => \{[\s\S]*?queueCharacterSave\(character\)[\s\S]*?\}, 800\)/)
  assert.match(configurationSource, /saveLocalCharacterConfig\(snapshot\)/)
  assert.match(configurationSource, /onCharacterSaved\(savedCharacter\)/)
  assert.doesNotMatch(configurationSource, />撤销更改</)
  assert.doesNotMatch(configurationSource, /> 保存角色</)
})

test("configuration has no persistent bottom action bar", () => {
  assert.doesNotMatch(configurationSource, /<footer/)
  assert.doesNotMatch(configurationSource, />取消<\/button>/)
  assert.doesNotMatch(configurationSource, /配置已保存；当前后端由开发启动器托管/)
  assert.match(configurationSource, /onClick=\{\(\) => void handleSave\(\)\}/)
})

test("model configuration displays the saved API key directly", () => {
  assert.match(configurationSource, /apiKey: next\.apiKey/)
  assert.match(configurationSource, /<input type="text" value=\{form\.apiKey\}/)
  assert.doesNotMatch(configurationSource, /showApiKey/)
  assert.doesNotMatch(configurationSource, /type="password"/)
  assert.doesNotMatch(configurationSource, /已保存密钥；留空保持不变/)
})

test("advanced model settings appear before test and save actions", () => {
  const advancedPosition = configurationSource.indexOf("高级模型设置")
  const testPosition = configurationSource.indexOf("测试连接", advancedPosition)
  const savePosition = configurationSource.indexOf("保存配置", advancedPosition)
  assert.ok(advancedPosition >= 0)
  assert.ok(testPosition > advancedPosition)
  assert.ok(savePosition > advancedPosition)
})

test("voice configuration provides a real GSV synthesis service and local devices", () => {
  assert.match(configurationSource, /id: "voice", label: "语音配置", icon: Volume2/)
  assert.match(configurationSource, /section === "voice"/)
  assert.match(configurationSource, /discoverGsv\(candidate, stage\)/)
  assert.match(configurationSource, /updateGsvTtsConfig\(gsvForm\)/)
  assert.match(configurationSource, /GSV 语音合成/)
  assert.match(configurationSource, /读取版本/)
  assert.match(configurationSource, /loadGsvWorlds\(event\.target\.value\)/)
  assert.match(configurationSource, /loadGsvRoles\(event\.target\.value\)/)
  assert.match(configurationSource, /loadGsvEmotions\(event\.target\.value\)/)
  assert.doesNotMatch(configurationSource, /测试并读取声线/)
  assert.match(configurationSource, /试听文本/)
  assert.match(configurationSource, /previewGsvVoice\(gsvForm, gsvPreviewText\)/)
  assert.match(configurationSource, /合成并播放/)
  assert.match(configurationSource, /角色声线/)
  assert.match(configurationSource, /角色情感/)
  assert.match(configurationSource, /高级合成参数/)
  assert.match(configurationSource, /GSV 语音转录/)
  assert.match(configurationSource, /GSV 转录服务地址/)
  assert.match(configurationSource, /testStt\(\)/)
  assert.match(configurationSource, /测试连接<\/button>/)
  assert.doesNotMatch(configurationSource, /测试转录服务/)
  assert.match(configurationSource, /testGsvStt\(sttForm\)/)
  assert.match(configurationSource, /updateGsvSttConfig\(sttForm\)/)
  assert.match(configurationSource, /实时断句与 VAD/)
  assert.match(configurationSource, /完成后自动发送/)
  assert.match(configurationSource, /applyDesktopPetSettings\(next\)/)
  assert.match(configurationSource, /声音输出设备/)
  assert.match(configurationSource, /系统默认麦克风/)
  assert.match(configurationSource, /播放音量/)
  assert.doesNotMatch(configurationSource, /当前角色声线/)
})
