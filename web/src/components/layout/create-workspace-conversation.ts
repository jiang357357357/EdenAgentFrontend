interface WorkspaceConversationAccess {
  current(): { sessionId?: string; revision: number; mounted: boolean }
  create(): Promise<{ id: string }>
  selected(sessionId: string): void
  choose(): Promise<string | null | undefined>
  bind(sessionId: string, path: string): Promise<unknown>
  changed(): void
  error(message: string): void
}

/** The explicit new-chat action survives its own tab selection, but no unrelated tab/account switch. */
export async function createWorkspaceConversation(access: WorkspaceConversationAccess): Promise<void> {
  const initial = access.current()
  let created: string | undefined
  let selected = false
  const current = () => {
    const now = access.current()
    return now.mounted && now.revision === initial.revision && (selected ? now.sessionId === created
      : now.sessionId === initial.sessionId || now.sessionId === created)
  }
  try {
    created = (await access.create()).id
    if (!current()) return
    access.selected(created)
    selected = true
    const path = await access.choose()
    if (!path || !current()) return
    await access.bind(created, path)
    if (current()) access.changed()
  } catch (error) {
    if (current()) access.error(error instanceof Error ? error.message : '创建会话或选择文件夹失败')
  }
}
