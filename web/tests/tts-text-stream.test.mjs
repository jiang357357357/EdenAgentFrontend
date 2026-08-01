import assert from "node:assert/strict"
import test from "node:test"

import { consumeSpeechStream } from "../src/lib/tts-text.ts"

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
