import assert from "node:assert/strict"
import test from "node:test"

import { consumeSpeechStream, speechChunksForTTS, speechStreamKey } from "../src/lib/tts-text.ts"

test("emits complete sentences while retaining the unfinished tail", () => {
  const first = consumeSpeechStream("第一句已经完成。第二句还在", "all", undefined)
  assert.deepEqual(first.chunks, ["第一句已经完成。"])

  const second = consumeSpeechStream("第一句已经完成。第二句还在生成！第三句", "all", first.cursor)
  assert.deepEqual(second.chunks, ["第二句还在生成！"])

  const final = consumeSpeechStream("第一句已经完成。第二句还在生成！第三句", "all", second.cursor, true)
  assert.deepEqual(final.chunks, ["第三句"])
})

test("does not emit an unfinished sentence before flush", () => {
  const update = consumeSpeechStream("这句话还没有结束", "all", undefined)
  assert.deepEqual(update.chunks, [])
  assert.equal(update.cursor.consumed, 0)

  const final = consumeSpeechStream("这句话还没有结束", "all", update.cursor, true)
  assert.deepEqual(final.chunks, ["这句话还没有结束"])
})

test("uses a bounded chunk when a generated sentence has no punctuation", () => {
  const update = consumeSpeechStream("一".repeat(200), "all", undefined)
  assert.equal(update.chunks.length, 1)
  assert.equal(update.chunks[0].length, 160)
  assert.equal(update.cursor.consumed, 160)
})

test("filters markdown code before finding streaming sentence boundaries", () => {
  const update = consumeSpeechStream("回答如下。\n```ts\nconsole.log('不要朗读。')\n```\n最后一句。", "text_only", undefined)
  assert.deepEqual(update.chunks, ["回答如下。"])
  const final = consumeSpeechStream("回答如下。\n```ts\nconsole.log('不要朗读。')\n```\n最后一句。", "text_only", update.cursor, true)
  assert.deepEqual(final.chunks, ["最后一句。"])
})

test("does not leak a closing quote into the next streamed sentence", () => {
  const first = consumeSpeechStream("“第一句。", "all", undefined)
  assert.deepEqual(first.chunks, [])

  const second = consumeSpeechStream("“第一句。”第二句。", "all", first.cursor)
  assert.deepEqual(second.chunks, ["“第一句。”"])
})

test("waits for Markdown completion before committing a rewritten sentence", () => {
  const first = consumeSpeechStream("请看[第一句。", "all", undefined)
  assert.deepEqual(first.chunks, [])

  const rewritten = consumeSpeechStream("请看[第一句。](https://example.com)", "all", first.cursor)
  assert.deepEqual(rewritten.chunks, [])

  const continued = consumeSpeechStream("请看[第一句。](https://example.com)第二句。", "all", rewritten.cursor)
  assert.deepEqual(continued.chunks, ["请看第一句。"])

  const next = consumeSpeechStream("请看[第一句。](https://example.com)第二句。第三句", "all", continued.cursor)
  assert.deepEqual(next.chunks, ["第二句。"])
})

test("requires a new speech epoch when canonical text shrinks across a committed boundary", () => {
  const first = consumeSpeechStream("第一句。第二句。", "all", undefined)
  assert.deepEqual(first.chunks, ["第一句。"])

  const shortened = consumeSpeechStream("第一句。", "all", first.cursor)
  assert.deepEqual(shortened.chunks, [])
  assert.equal(shortened.resetRequired, true)

  const restored = consumeSpeechStream("第一句。第二句。第三句。", "all", undefined)
  assert.deepEqual(restored.chunks, ["第一句。", "第二句。"])
})

test("still emits an intentional repeated sentence at a new logical ordinal", () => {
  const first = consumeSpeechStream("你好。", "all", undefined)
  const second = consumeSpeechStream("你好。你好。", "all", first.cursor)
  assert.deepEqual(second.chunks, ["你好。"])
})

test("logical speech stream keys are independent from renderer segment ids", () => {
  assert.equal(speechStreamKey("message-1", 0), "message-1:speech:0:epoch:0")
  assert.equal(speechStreamKey("message-1", 1, 3), "message-1:speech:1:epoch:3")
})

test("does not commit a provisional decimal or version suffix", () => {
  const first = consumeSpeechStream("版本是 1.", "all", undefined)
  assert.deepEqual(first.chunks, [])

  const second = consumeSpeechStream("版本是 1.8.", "all", first.cursor)
  assert.deepEqual(second.chunks, [])

  const third = consumeSpeechStream("版本是 1.8.0，已经发布。下一句", "all", second.cursor)
  assert.deepEqual(third.chunks, ["版本是 1.8.0，已经发布。"])
})

test("keeps common English abbreviations inside the sentence", () => {
  const first = consumeSpeechStream("Use e.g.", "all", undefined)
  assert.deepEqual(first.chunks, [])

  const second = consumeSpeechStream("Use e.g. this option. Next", "all", first.cursor)
  assert.deepEqual(second.chunks, ["Use e.g. this option."])
})

test("commits Chinese and ASCII ellipses only after lookahead", () => {
  const chineseTail = consumeSpeechStream("我想一下……", "all", undefined)
  assert.deepEqual(chineseTail.chunks, [])
  const chineseContinued = consumeSpeechStream("我想一下……然后继续。", "all", chineseTail.cursor)
  assert.deepEqual(chineseContinued.chunks, ["我想一下……"])

  const asciiTail = consumeSpeechStream("Wait...", "all", undefined)
  assert.deepEqual(asciiTail.chunks, [])
  const asciiContinued = consumeSpeechStream("Wait... Continue.", "all", asciiTail.cursor)
  assert.deepEqual(asciiContinued.chunks, ["Wait..."])
})

test("committed chunks carry stable offsets and fingerprints", () => {
  const first = consumeSpeechStream("第一句。第二句", "all", undefined)
  const second = consumeSpeechStream("第一句。第二句继续", "all", first.cursor)

  assert.equal(first.cursor.committed[0].start, 0)
  assert.equal(first.cursor.committed[0].end, "第一句。".length)
  assert.match(first.cursor.committed[0].fingerprint, /^4:[a-f\d]{8}$/)
  assert.deepEqual(second.chunks, [])
  assert.equal(second.resetRequired, false)
})

test("manual replay uses the same chunks as completed streaming speech", () => {
  const text = "第一句已经完成。第二句也完成了！最后一句没有标点"
  const streamed = consumeSpeechStream(text, "all", undefined, true)
  assert.deepEqual(speechChunksForTTS(text, "all"), streamed.chunks)
})
