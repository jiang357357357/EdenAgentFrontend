const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

function parseUrl(rawUrl) {
  try {
    return new URL(String(rawUrl || ""))
  } catch {
    return null
  }
}

function isInternalAppUrl(rawUrl, { isPackaged, devOrigin }) {
  const url = parseUrl(rawUrl)
  if (!url) return false

  if (!isPackaged) {
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === devOrigin
  }

  return url.protocol === "edenagent:" && url.host === "app" && url.pathname === "/index.html"
}

function isSupportedExternalUrl(rawUrl) {
  const url = parseUrl(rawUrl)
  return Boolean(url && EXTERNAL_PROTOCOLS.has(url.protocol))
}

module.exports = {
  isInternalAppUrl,
  isSupportedExternalUrl,
}
