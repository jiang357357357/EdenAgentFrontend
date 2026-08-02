import assert from "node:assert/strict"
import test from "node:test"

import { consumeSpeechStream, speechStreamKey } from "../src/lib/tts-text.ts"

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
  assert.equal(update.chunks[0].length, 180)
  assert.equal(update.cursor.consumed, 180)
})

test("filters markdown code before finding streaming sentence boundaries", () => {
  const update = consumeSpeechStream("回答如下。\n```ts\nconsole.log('不要朗读。')\n```\n最后一句。", "text_only", undefined)
  assert.deepEqual(update.chunks, ["回答如下。", "最后一句。"])
})

test("does not leak a closing quote into the next streamed sentence", () => {
  const first = consumeSpeechStream("“第一句。", "all", undefined)
  assert.deepEqual(first.chunks, ["“第一句。"])

  const second = consumeSpeechStream("“第一句。”第二句。", "all", first.cursor)
  assert.deepEqual(second.chunks, ["第二句。"])
})

test("does not recommit the first sentence when markdown completion rewrites its prefix", () => {
  const first = consumeSpeechStream("请看[第一句。", "all", undefined)
  assert.deepEqual(first.chunks, ["请看[第一句。"])

  const rewritten = consumeSpeechStream("请看[第一句。](https://example.com)", "all", first.cursor)
  assert.deepEqual(rewritten.chunks, [])

  const continued = consumeSpeechStream("请看[第一句。](https://example.com)第二句。", "all", rewritten.cursor)
  assert.deepEqual(continued.chunks, ["第二句。"])
})

test("keeps the committed frontier when canonical text temporarily shrinks", () => {
  const first = consumeSpeechStream("第一句。第二句。", "all", undefined)
  assert.deepEqual(first.chunks, ["第一句。", "第二句。"])

  const shortened = consumeSpeechStream("第一句。", "all", first.cursor)
  assert.deepEqual(shortened.chunks, [])

  const restored = consumeSpeechStream("第一句。第二句。第三句。", "all", shortened.cursor)
  assert.deepEqual(restored.chunks, ["第三句。"])
})

test("still emits an intentional repeated sentence at a new logical ordinal", () => {
  const first = consumeSpeechStream("你好。", "all", undefined)
  const second = consumeSpeechStream("你好。你好。", "all", first.cursor)
  assert.deepEqual(second.chunks, ["你好。"])
})

test("logical speech stream keys are independent from renderer segment ids", () => {
  assert.equal(speechStreamKey("message-1", 0), "message-1:speech:0")
  assert.equal(speechStreamKey("message-1", 1), "message-1:speech:1")
})
