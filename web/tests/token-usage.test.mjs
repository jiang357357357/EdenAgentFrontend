import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_CONTEXT_WINDOW,
  estimateConversationTokens,
  estimateTextTokens,
  formatPromptCacheState,
  formatTokenCount,
} from "../src/lib/token-usage.ts"

test("empty input has no tokens", () => {
  assert.equal(estimateTextTokens("   \n"), 0)
})

test("CJK input is counted close to one token per visible character", () => {
  assert.equal(estimateTextTokens("继续分析这段对话。"), 9)
})

test("latin input uses a compact character estimate", () => {
  assert.equal(estimateTextTokens("hello world"), 3)
})

test("conversation estimate includes ordered segments, tools, and images", () => {
  const tokens = estimateConversationTokens([
    { content: "这段回退内容不应重复统计", segments: [{ type: "text", content: "你好" }] },
    { segments: [{ type: "tool", tool: { input: "read file", output: "done" } }], images: ["image.png"] },
  ])

  assert.equal(tokens, 1_206)
})

test("a compaction event resets the visible-history estimate to the server context", () => {
  const tokens = estimateConversationTokens([
    { segments: [{ type: "text", content: "这是一段已经被压缩的旧对话" }] },
    {
      segments: [
        {
          type: "meta",
          part: { type: "compaction", contextTokensAfter: 120 },
        },
      ],
    },
    { segments: [{ type: "text", content: "继续" }] },
  ])

  assert.equal(tokens, 122)
})

test("token counts use the Chinese locale and share the runtime fallback", () => {
  assert.equal(formatTokenCount(128000), "128,000")
  assert.equal(DEFAULT_CONTEXT_WINDOW, 256_000)
})

test("prompt cache state uses readable Chinese generation and change labels", () => {
  assert.equal(formatPromptCacheState(0, "stable"), "第 0 代 · 稳定")
  assert.equal(formatPromptCacheState(2, "model,tools"), "第 2 代 · 模型变更、工具定义变更")
  assert.equal(formatPromptCacheState(undefined, undefined), "第 0 代 · 未知")
})
