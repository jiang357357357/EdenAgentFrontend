export type SpineLoadErrorCode =
  | "aborted"
  | "asset-incomplete"
  | "asset-invalid"
  | "atlas-texture-missing"
  | "http"
  | "network"
  | "runtime-version"
  | "texture-decode"
  | "unknown"

export interface SpineLoadFailure {
  code: SpineLoadErrorCode
  message: string
  retryable: boolean
}

export class SpineAssetLoadError extends Error {
  readonly code: SpineLoadErrorCode
  readonly retryable: boolean

  constructor(
    code: SpineLoadErrorCode,
    message: string,
    retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = "SpineAssetLoadError"
    this.code = code
    this.retryable = retryable
  }
}

export function isSpineAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError"
}

export function normalizeSpineLoadFailure(error: unknown): SpineLoadFailure {
  if (isSpineAbortError(error)) {
    return { code: "aborted", message: "Spine 资源加载已取消", retryable: false }
  }
  if (error instanceof SpineAssetLoadError) {
    return { code: error.code, message: error.message, retryable: error.retryable }
  }

  const message = error instanceof Error ? error.message : String(error || "Spine 渲染失败")
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return { code: "network", message, retryable: true }
  }
  return { code: "unknown", message, retryable: false }
}

const RETRY_DELAYS_MS = [300, 1_000, 3_000, 10_000, 30_000] as const

export function spineRetryDelayMs(failureCount: number) {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, Math.floor(failureCount) - 1))
  return RETRY_DELAYS_MS[index]
}

