import React, { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MessageFooter } from "../../src/components/chat/message/MessageFooter"

const text = "**完整回答**\n中文、emoji 😊\n  代码\\路径\n"
const delay = () => new Promise(resolve => setTimeout(resolve, 15))

Object.assign(window, {
  async runDesktopClipboardTests() {
    let browserError = ""
    try { await navigator.clipboard.writeText("browser API must be denied") }
    catch (error) { browserError = (error as Error).name }
    if (browserError !== "NotAllowedError") throw new Error(`Expected clipboard denial: ${browserError}`)
    const root = document.createElement("div")
    document.body.append(root)
    createRoot(root).render(<StrictMode><MessageFooter durationMs={16200} text={text} /></StrictMode>)
    for (let attempt = 0; attempt < 100; attempt++) {
      if (document.querySelector('button[aria-label="复制回答"]')) break
      await delay()
    }
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="复制回答"]')
    if (!button) throw new Error("Copy button did not render")
    button.click()
    for (let attempt = 0; attempt < 100; attempt++) {
      if (document.querySelector('button[aria-label="已复制"]')) break
      await delay()
    }
    if (!document.querySelector('button[aria-label="已复制"]')) {
      throw new Error(`Desktop copy failed: ${document.body.textContent}`)
    }
    if (document.body.textContent?.includes("复制失败")) throw new Error("Unexpected copy error")
    return { browserError, copied: true, text }
  },
})
