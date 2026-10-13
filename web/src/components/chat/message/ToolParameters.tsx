import { ToolDataView, type ToolDataVariant } from "./ToolDataView"
export { toolTextClass } from "./ToolDataView"

export function ToolParameters({ input, variant }: { input: string; variant?: ToolDataVariant }) {
  return <ToolDataView text={input} kind="input" variant={variant} />
}
