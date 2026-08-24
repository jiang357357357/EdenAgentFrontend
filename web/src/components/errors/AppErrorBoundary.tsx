import { Component, type ErrorInfo, type ReactNode } from "react"

interface AppErrorBoundaryProps {
  petSurface: boolean
  children: ReactNode
}

interface AppErrorBoundaryState {
  failed: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.props.petSurface) document.documentElement.classList.add("character-transparent")
    console.error("[Eden Agent] application render failed", error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    if (this.props.petSurface) return null

    return (
      <main className="flex min-h-screen items-center justify-center bg-bg px-6 text-text">
        <section className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
          <h1 className="font-serif text-2xl">聊天界面渲染失败</h1>
          <p className="mt-3 text-sm text-text-muted">错误已经记录。重新加载后可以继续使用。</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-full bg-accent px-5 py-2 text-sm text-white hover:opacity-90"
          >
            重新加载
          </button>
        </section>
      </main>
    )
  }
}
