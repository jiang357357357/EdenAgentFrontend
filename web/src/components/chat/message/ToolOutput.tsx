import { ToolDataView, type ToolDataVariant } from "./ToolDataView"

export function ToolOutput({ output, variant }: { output: string; variant?: ToolDataVariant }) {
  return <ToolDataView text={output} kind="output" variant={variant} />
}
