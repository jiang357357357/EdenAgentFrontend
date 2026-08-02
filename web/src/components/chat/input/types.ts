import type { ToolCall } from "../../../types"

export interface DialogSegment {
  speaker: string
  text?: string
  images?: string[]
  runtimeTrace?: string
  thinking?: string
  tool?: ToolCall
}
