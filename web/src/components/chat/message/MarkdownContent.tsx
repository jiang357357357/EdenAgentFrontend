import { memo } from "react"
import { resolveEdenAgentUrl } from "../../../lib/agent-client"
import { MarkdownBody, type MarkdownBodyProps } from "./MarkdownBody"

export const MarkdownContent = memo(function MarkdownContent(props: Omit<MarkdownBodyProps, "resolveImage">) {
  return <MarkdownBody {...props} resolveImage={resolveEdenAgentUrl} />
})
