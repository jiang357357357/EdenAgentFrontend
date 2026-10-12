import { useEffect, useRef, useState } from "react"
import { copyReplyText } from "../../../lib/reply-copy"

export function useMessageFooterActions(text: string, onDelete?: () => Promise<void>) {
  const [copied, setCopied] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyError, setCopyError] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const copyingRef = useRef(false), deletingRef = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    if (copyingRef.current || !text.trim()) return
    copyingRef.current = true
    setCopying(true); setCopied(false); setCopyError("")
    try {
      await copyReplyText(text)
      if (mounted.current) setCopied(true)
    } catch (error) {
      if (mounted.current) setCopyError(error instanceof Error ? error.message : "复制失败，请重试。")
    } finally {
      copyingRef.current = false
      if (mounted.current) setCopying(false)
    }
  }

  const remove = async () => {
    if (!confirming || deletingRef.current || !onDelete) return
    deletingRef.current = true
    setDeleting(true); setDeleteError("")
    try {
      await onDelete()
      if (mounted.current) setConfirming(false)
    } catch (error) {
      if (mounted.current) setDeleteError(error instanceof Error ? error.message : "删除失败，请重试。")
    } finally {
      deletingRef.current = false
      if (mounted.current) setDeleting(false)
    }
  }

  return { copied, copying, copyError, copy, confirming, deleting, deleteError, remove,
    requestDelete: () => { setDeleteError(""); setConfirming(true) },
    cancelDelete: () => { if (!deletingRef.current) setConfirming(false) } }
}
