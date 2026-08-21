import { FileText, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { resolveMonAgentUrl } from "../../../lib/agent-client"
import { cn } from "../../../lib/utils"
import type { PromptAttachment } from "../../../types"

interface AttachmentTrayProps {
  attachments: PromptAttachment[]
  onRemove: (index: number) => void
  overlay: boolean
}

export function AttachmentTray({ attachments, onRemove, overlay }: AttachmentTrayProps) {
  return (
    <AnimatePresence>
      {attachments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className={cn(
            "absolute z-30 flex max-w-[calc(100%-4vh)] gap-2 overflow-x-auto rounded-[1.6vh] border p-[0.8vh] shadow-lg backdrop-blur-md",
            overlay
              ? "left-[2vh] top-[1.5vh] border-white/12 bg-stone-950/70"
              : "bottom-[calc(100%-1.2vh)] left-[2vh] border-border/80 bg-card/95",
          )}
        >
          {attachments.map((attachment, index) => (
            <div key={`${attachment.filename ?? "attachment"}-${index}`} className="relative group flex-shrink-0">
              {attachment.mime.startsWith("image/") ? (
                <img src={resolveMonAgentUrl(attachment.url)} alt={attachment.filename ?? "附件预览"} className="h-[10vh] w-[10vh] rounded-[1.4vh] border border-border object-cover" />
              ) : (
                <div className="flex h-[10vh] w-[24vw] items-center gap-[1vw] rounded-[1.4vh] border border-border bg-card px-[1.8vw] text-[1.8vh] text-text">
                  <FileText className="h-[2.6vh] w-[2.6vh] flex-shrink-0 text-text-muted" />
                  <span className="truncate">{attachment.filename ?? "附件"}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute right-[-0.9vh] top-[-0.9vh] rounded-full border border-border bg-card p-[0.35vh] text-accent opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-[2vh] w-[2vh]" />
              </button>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
