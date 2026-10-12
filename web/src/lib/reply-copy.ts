import type { MessageData } from "../types"

export function replyCopyText(message: Pick<MessageData, "content" | "segments">): string {
  if (message.content?.trim()) return message.content
  return (message.segments ?? []).flatMap(segment => segment.type === "text" ? [segment.content] : []).join("\n\n")
}

export async function copyReplyText(text: string): Promise<void> {
  const bridge = window.edenAgentDesktop
  if (bridge) {
    try {
      const copied = await bridge.invoke<boolean>("write_clipboard_text", { text })
      if (copied !== true) throw new Error("剪贴板未确认写入，请重试。")
    } catch (error) {
      if (error instanceof Error && /未知桌面命令:\s*write_clipboard_text\s*$/.test(error.message)) {
        throw new Error("桌面组件尚未加载复制功能。请从系统托盘退出 Eden Agent 后重新启动；仅刷新页面或关闭窗口不会生效。")
      }
      throw error
    }
    return
  }
  if (!navigator.clipboard?.writeText) throw new Error("当前环境无法访问剪贴板。")
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    if (error instanceof Error && error.name === "NotAllowedError") {
      throw new Error("浏览器拒绝了复制，请允许此页面写入剪贴板后重试。")
    }
    throw error
  }
}
