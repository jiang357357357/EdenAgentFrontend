import { Component, type ErrorInfo, type ReactNode } from "react"

interface PetSurfaceErrorBoundaryProps {
  surface: "character" | "bubble" | "icon" | "combined"
  children: ReactNode
}

interface PetSurfaceErrorBoundaryState {
  error?: Error
}

export class PetSurfaceErrorBoundary extends Component<PetSurfaceErrorBoundaryProps, PetSurfaceErrorBoundaryState> {
  state: PetSurfaceErrorBoundaryState = {}

  static getDerivedStateFromError(error: Error): PetSurfaceErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[DesktopPet] render failed", error, info.componentStack)
  }

  private retry = () => {
    this.setState({ error: undefined })
  }

  render() {
    if (!this.state.error) return this.props.children
    if (this.props.surface === "character") return null

    return (
      <div className="flex h-full w-full items-center justify-center [container-type:size]">
        <section className="flex h-full w-full flex-col items-center justify-center gap-[3cqh] rounded-[6cqh] border border-danger/20 bg-overlay/90 px-[6cqh] text-center text-text shadow-[0_2cqh_6cqh_color-mix(in_srgb,var(--color-scrim)_28%,transparent)] backdrop-blur-xl">
          <p className="m-0 text-[4cqh]">聊天气泡渲染失败</p>
          <button
            type="button"
            onClick={this.retry}
            className="rounded-full bg-accent px-[5cqh] py-[2cqh] text-[3.5cqh] text-on-accent hover:bg-accent-hover"
          >
            重新渲染
          </button>
        </section>
      </div>
    )
  }
}
