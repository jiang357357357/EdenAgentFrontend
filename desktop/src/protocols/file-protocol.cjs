function desktopFileUrl(filePath) {
  if (!filePath) return ""
  return `monagent-file://local/file?path=${encodeURIComponent(String(filePath))}`
}

function filePathFromDesktopUrl(requestUrl, platform = process.platform) {
  const url = new URL(requestUrl)
  const explicitPath = url.searchParams.get("path")
  if (explicitPath) return explicitPath

  const pathname = decodeURIComponent(url.pathname)
  if (platform === "win32" && /^[A-Za-z]$/.test(url.host)) {
    return `${url.host.toUpperCase()}:${pathname}`
  }

  let filePath = decodeURIComponent(url.host ? `/${url.host}${url.pathname}` : url.pathname)
  if (platform === "win32" && /^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1)
  return filePath
}

module.exports = {
  desktopFileUrl,
  filePathFromDesktopUrl,
}
