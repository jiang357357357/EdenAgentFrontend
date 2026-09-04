const path = require("node:path")
const { pathToFileURL } = require("node:url")

const APP_SCHEME = "edenagent"
const APP_HOST = "app"
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

function desktopAppUrl(page) {
  const url = new URL(`${APP_ORIGIN}/index.html`)
  if (page) url.searchParams.set("page", page)
  return url.toString()
}

function appFilePathFromUrl(requestUrl, { appRoot, pathApi = path } = {}) {
  if (!appRoot) throw new TypeError("appRoot is required")
  const url = new URL(requestUrl)
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
    throw new TypeError("unsupported Eden Agent application URL")
  }

  const relativePath = decodeURIComponent(url.pathname).replace(/^[/\\]+/, "")
  const root = pathApi.resolve(appRoot)
  const target = pathApi.resolve(root, relativePath)
  const relative = pathApi.relative(root, target)
  if (!relative || relative.startsWith("..") || pathApi.isAbsolute(relative)) {
    throw new TypeError("application URL is outside the bundled web root")
  }
  return target
}

function registerAppProtocol({ protocol, net, appRoot }) {
  if (!protocol?.handle) throw new TypeError("protocol.handle is required")
  if (!net?.fetch) throw new TypeError("net.fetch is required")
  if (!appRoot) throw new TypeError("appRoot is required")

  protocol.handle(APP_SCHEME, (request) => {
    try {
      const filePath = appFilePathFromUrl(request.url, { appRoot })
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response("Not found", { status: 404 })
    }
  })
}

module.exports = {
  APP_HOST,
  APP_ORIGIN,
  APP_SCHEME,
  appFilePathFromUrl,
  desktopAppUrl,
  registerAppProtocol,
}
