const path = require("node:path")
const { fileURLToPath } = require("node:url")

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

function parseUrl(rawUrl) {
  try {
    return new URL(String(rawUrl || ""))
  } catch {
    return null
  }
}

function isInternalAppUrl(rawUrl, { isPackaged, appEntryFile, devOrigin }) {
  const url = parseUrl(rawUrl)
  if (!url) return false

  if (!isPackaged) {
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === devOrigin
  }

  if (url.protocol !== "file:" || !appEntryFile) return false
  try {
    return path.resolve(fileURLToPath(url)) === path.resolve(appEntryFile)
  } catch {
    return false
  }
}

function isSupportedExternalUrl(rawUrl) {
  const url = parseUrl(rawUrl)
  return Boolean(url && EXTERNAL_PROTOCOLS.has(url.protocol))
}

module.exports = {
  isInternalAppUrl,
  isSupportedExternalUrl,
}
