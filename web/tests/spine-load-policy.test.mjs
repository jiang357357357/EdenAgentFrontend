import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeSpineLoadFailure,
  SpineAssetLoadError,
  spineRetryDelayMs,
} from "../src/lib/spine-load-policy.ts"

test("network and temporary HTTP failures remain retryable", () => {
  assert.deepEqual(
    normalizeSpineLoadFailure(new SpineAssetLoadError("network", "骨骼文件网络读取失败", true)),
    { code: "network", message: "骨骼文件网络读取失败", retryable: true },
  )
  assert.equal(
    normalizeSpineLoadFailure(new SpineAssetLoadError("http", "纹理读取失败（503）", true)).retryable,
    true,
  )
})

test("invalid packages and runtime versions never enter a retry loop", () => {
  assert.equal(
    normalizeSpineLoadFailure(new SpineAssetLoadError("asset-invalid", "资源损坏", false)).retryable,
    false,
  )
  assert.equal(
    normalizeSpineLoadFailure(new SpineAssetLoadError("runtime-version", "版本不兼容", false)).retryable,
    false,
  )
})

test("retry delay backs off and stays capped", () => {
  assert.equal(spineRetryDelayMs(1), 300)
  assert.equal(spineRetryDelayMs(2), 1_000)
  assert.equal(spineRetryDelayMs(5), 30_000)
  assert.equal(spineRetryDelayMs(99), 30_000)
})
