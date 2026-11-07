export type EditorLayout = { type: 'group'; id: string } | { type: 'split'; id: string; axis: 'horizontal' | 'vertical'; ratio: number; children: [EditorLayout, EditorLayout] }
export const editorGroups = (node: EditorLayout): string[] => node.type === 'group' ? [node.id] : node.children.flatMap(editorGroups)
export function minimumEditorExtent(node: EditorLayout): {width:number;height:number} {
  if(node.type==='group')return {width:280,height:200}
  const [first,second]=node.children.map(minimumEditorExtent)
  return node.axis==='horizontal'?{width:first.width+second.width+4,height:Math.max(first.height,second.height)}
    :{width:Math.max(first.width,second.width),height:first.height+second.height+4}
}
export function splitEditor(node: EditorLayout, group: string, next: string, axis: 'horizontal' | 'vertical'): EditorLayout {
  if (node.type === 'group') return node.id === group ? { type: 'split', id: `split:${next}`, axis, ratio: .5, children: [node, { type: 'group', id: next }] } : node
  return { ...node, children: node.children.map(child => splitEditor(child, group, next, axis)) as [EditorLayout, EditorLayout] }
}
export function resizeEditor(node: EditorLayout, id: string, ratio: number): EditorLayout {
  return node.type === 'group' ? node : { ...node, ratio: node.id === id ? Math.max(.15, Math.min(.85, ratio)) : node.ratio,
    children: node.children.map(child => resizeEditor(child, id, ratio)) as [EditorLayout, EditorLayout] }
}
export function removeEditor(node: EditorLayout, id: string): EditorLayout | null {
  if (node.type === 'group') return node.id === id ? null : node
  const first = removeEditor(node.children[0], id), second = removeEditor(node.children[1], id)
  return first && second ? { ...node, children: [first, second] } : first ?? second
}
export function parseEditorLayout(value: unknown, seen = new Set<string>(), depth = 0): EditorLayout | null {
  if (!value || typeof value !== 'object' || depth > 8) return null
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !/^(main|side|editor-\d+|split:editor-\d+)$/.test(item.id) || seen.has(item.id)) return null
  seen.add(item.id)
  if (item.type === 'group' && !item.id.startsWith('split:')) return { type: 'group', id: item.id }
  if (item.type !== 'split' || !['horizontal', 'vertical'].includes(String(item.axis)) || !Array.isArray(item.children) || item.children.length !== 2) return null
  const first = parseEditorLayout(item.children[0], seen, depth + 1), second = parseEditorLayout(item.children[1], seen, depth + 1)
  return first && second ? { type: 'split', id: item.id, axis: item.axis as 'horizontal' | 'vertical', children: [first, second],
    ratio: typeof item.ratio === 'number' && Number.isFinite(item.ratio) ? Math.max(.15, Math.min(.85, item.ratio)) : .5 } : null
}
