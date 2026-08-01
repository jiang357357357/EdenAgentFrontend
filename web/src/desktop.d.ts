export {}

declare global {
  interface Window {
    monAgentDesktop?: {
      invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>
      onViewMode?(callback: (mode: "chatWithCharacter" | "character") => void): () => void
      onPetSettings?(callback: (settings: Record<string, unknown>) => void): () => void
      onPetBubbleCollapsed?(callback: (collapsed: boolean) => void): () => void
      onDesktopEnvironment?(callback: (environment: Record<string, unknown>) => void): () => void
      onOpenSettings?(callback: () => void): () => void
      onAuthState?(callback: (state: {
        type: "authenticated" | "unauthenticated"
        token?: string
        response?: {
          valid: boolean
          user: import("./lib/auth").AuthUser
          token_info?: { expires_at?: string }
        }
      }) => void): () => void
      onSpeechPlaybackControl?(callback: (control: {
        type: "stop"
        leaseId: string
        reason?: string
      }) => void): () => void
      convertFileSrc?(filePath: string): string
    }
  }
}
