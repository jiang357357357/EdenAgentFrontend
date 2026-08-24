const { pathToFileURL } = require("node:url")

const { filePathFromDesktopUrl } = require("./file-protocol.cjs")

function registerFileProtocol({ protocol, net }) {
  if (!protocol?.handle) throw new TypeError("protocol.handle is required")
  if (!net?.fetch) throw new TypeError("net.fetch is required")

  protocol.handle("edenagent-file", (request) => {
    const filePath = filePathFromDesktopUrl(request.url)
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

module.exports = { registerFileProtocol }
