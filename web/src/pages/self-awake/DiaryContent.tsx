import { MarkdownContent } from "../../components/chat/message"
import { cn } from "../../lib/utils"

export function DiaryContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("prose max-w-none min-w-0 text-text [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0", className)}>
      <MarkdownContent content={content} paragraphClassName="indent-0 whitespace-pre-wrap" />
    </div>
  )
}
