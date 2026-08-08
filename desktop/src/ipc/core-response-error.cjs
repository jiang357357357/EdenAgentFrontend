function fallbackMessage(response) {
  const status = Number(response?.status) || 0
  const statusText = String(response?.statusText || "").trim()
  const suffix = [status || undefined, statusText || undefined].filter(Boolean).join(" ")
  return `MonCore 接口返回服务器错误${suffix ? `（${suffix}）` : ""}，请查看 MonCore 日志。`
}

function looksLikeHtml(text, contentType) {
  return /text\/html/i.test(contentType) || /^\s*(?:<!doctype\s+html|<html\b)/i.test(text)
}

function looksLikeTraceback(text) {
  return /\bTraceback \(most recent call last\)|\bException (?:Type|Value):|<div id="traceback">/i.test(text)
}

async function parseCoreError(response) {
  const text = await response.text().catch(() => "")
  try {
    const data = JSON.parse(text)
    const message = data?.error ?? data?.message
    if (typeof message === "string" && message.trim()) return message.trim()
  } catch {}

  const contentType = response?.headers?.get?.("content-type") || ""
  if (!text || looksLikeHtml(text, contentType) || looksLikeTraceback(text)) {
    return fallbackMessage(response)
  }

  const compact = text.replace(/\s+/g, " ").trim()
  return compact.length > 400 ? `${compact.slice(0, 397)}...` : compact
}

module.exports = { parseCoreError }
