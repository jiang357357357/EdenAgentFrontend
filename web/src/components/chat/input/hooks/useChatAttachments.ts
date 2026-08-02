import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react"

import type { PromptAttachment } from "../../../../types"

const imageMimeByExtension: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
}

export function useChatAttachments() {
  const [attachments, setAttachments] = useState<PromptAttachment[]>([])
  const [draggingFiles, setDraggingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFileAttachment = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      if (event.target?.result && typeof event.target.result === "string") {
        setAttachments((previous) => [
          ...previous,
          {
            url: event.target!.result as string,
            filename: file.name || `attachment-${previous.length + 1}`,
            mime: file.type || "application/octet-stream",
            size: file.size,
          },
        ])
      }
    }
    reader.readAsDataURL(file)
  }

  const addFileAttachments = (files: FileList | File[]) => {
    for (const file of Array.from(files)) addFileAttachment(file)
  }

  const addLocalImagePath = (rawPath: string) => {
    const value = rawPath.trim()
    const fileUrl = value.startsWith("file://")
      ? value
      : value.startsWith("/")
        ? `file://${encodeURI(value)}`
        : `file:///${encodeURI(value.replace(/\\/g, "/"))}`
    const pathname = value.startsWith("file://") ? decodeURIComponent(new URL(value).pathname) : value
    const filename = pathname.split(/[\\/]/).filter(Boolean).pop() || `image-${attachments.length + 1}`
    const extension = filename.split(".").pop()?.toLowerCase() || ""
    const mime = imageMimeByExtension[extension]
    if (!mime) return false
    setAttachments((previous) => previous.some((item) => item.url === fileUrl)
      ? previous
      : [...previous, { url: fileUrl, filename, mime }])
    return true
  }

  const handlePaste = (event: ClipboardEvent) => {
    let addedFile = false
    for (const item of event.clipboardData.items) {
      const file = item.getAsFile()
      if (file) {
        addFileAttachment(file)
        addedFile = true
      }
    }
    if (addedFile) return
    const pastedText = event.clipboardData.getData("text/plain").trim()
    if (/^(?:file:\/\/\/|\/|[A-Za-z]:[\\/]).+\.(?:png|jpe?g|gif|webp|bmp|avif)(?:[?#].*)?$/i.test(pastedText)) {
      try {
        if (addLocalImagePath(pastedText)) event.preventDefault()
      } catch {
        // Invalid file URL remains ordinary pasted text.
      }
    }
  }

  const handleFilePick = () => fileInputRef.current?.click()

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return
    addFileAttachments(files)
    event.target.value = ""
  }

  const hasDraggedFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files")

  const handleDragOver = (event: DragEvent) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    setDraggingFiles(true)
  }

  const handleDragLeave = (event: DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFiles(false)
  }

  const handleDrop = (event: DragEvent) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    setDraggingFiles(false)
    addFileAttachments(event.dataTransfer.files)
  }

  const removeAttachment = (index: number) => {
    setAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
  }

  return {
    attachments,
    clearAttachments: () => setAttachments([]),
    draggingFiles,
    fileInputRef,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileChange,
    handleFilePick,
    handlePaste,
    removeAttachment,
  }
}
