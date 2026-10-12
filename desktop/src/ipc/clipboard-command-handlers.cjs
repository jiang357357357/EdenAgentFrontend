function createClipboardCommandHandlers({ clipboard, getWindows, isInternalUrl }) {
  return {
    write_clipboard_text: ({ event, sender, args }) => {
      const trustedWindow = getWindows().some(window => (
        window && !window.isDestroyed() && window.webContents === sender
      ))
      if (!trustedWindow || sender.isDestroyed() || !event.senderFrame
        || event.senderFrame !== sender.mainFrame || !isInternalUrl(event.senderFrame.url)) {
        throw new Error("当前页面无权写入桌面剪贴板。")
      }
      if (typeof args.text !== "string") throw new TypeError("复制内容必须是文本。")
      clipboard.writeText(args.text)
      return true
    },
  }
}

module.exports = { createClipboardCommandHandlers }
