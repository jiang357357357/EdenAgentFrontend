import { Application, UPDATE_PRIORITY } from "pixi.js"
import { Physics } from "@esotericsoftware/spine-pixi-v7"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import type { ActiveCharacterAction, CoreCharacterSpineAsset } from "../../../../lib/auth"
import { loadSpineAsset, type LoadedSpineAsset } from "../../../../lib/spine-loader"
import {
  pickSpineReaction,
  resolveSpineInteractionAnimations,
  spineInteractionZone,
  type SpineInteractionAnimations,
} from "../../../../lib/spine-interactions"
import { cn } from "../../../../lib/utils"
import { actionMapping, interactionTrackAvailable, playLayeredInteraction, playMappedAction } from "./spine-actions"
import { initialInteractionState, type PointerInteractionState } from "./spine-interactions"

interface SpineCharacterCanvasProps {
  asset: CoreCharacterSpineAsset
  activeAction?: ActiveCharacterAction
  className?: string
  onError?: (error: Error) => void
  onReady?: () => void
}

export function SpineCharacterCanvas({ asset, activeAction, className, onError, onReady }: SpineCharacterCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const loadedRef = useRef<LoadedSpineAsset | null>(null)
  const idleAnimationRef = useRef("")
  const memoryLobbyRef = useRef(false)
  const startupPendingRef = useRef(false)
  const animationNamesRef = useRef<Set<string>>(new Set())
  const interactionAnimationsRef = useRef<SpineInteractionAnimations>(resolveSpineInteractionAnimations([]))
  const pointerInteractionRef = useRef<PointerInteractionState>(initialInteractionState())
  const activeActionRef = useRef(activeAction)
  const onErrorRef = useRef(onError)
  const onReadyRef = useRef(onReady)
  const [ready, setReady] = useState(false)
  const [interactive, setInteractive] = useState(false)

  activeActionRef.current = activeAction
  onErrorRef.current = onError
  onReadyRef.current = onReady

  const assetKey = useMemo(() => JSON.stringify({
    skeleton: asset.skeleton_url,
    atlas: asset.atlas_url,
    textures: asset.textures.map((texture) => [texture.page_name, texture.file_url]),
    skin: asset.default_skin,
    idle: asset.idle_animation,
    scale: asset.scale,
    x: asset.offset_x,
    y: asset.offset_y,
  }), [asset])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const abortController = new AbortController()
    let disposed = false
    let startupFitTimer: number | undefined
    const app = new Application({
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      backgroundAlpha: 0,
    })
    const canvas = app.view as HTMLCanvasElement
    canvas.className = "block h-full w-full"
    canvas.setAttribute("aria-hidden", "true")
    host.appendChild(canvas)
    appRef.current = app

    const updateSpine = () => {
      const loaded = loadedRef.current
      if (!loaded) return
      const deltaSeconds = Math.min(0.05, Math.max(0, app.ticker.elapsedMS / 1000))
      loaded.spine.update(deltaSeconds)

      const interaction = pointerInteractionRef.current
      const targetX = interaction.mode === "look" || interaction.mode === "press" || interaction.mode === "pat"
        ? interaction.targetX
        : 0
      const targetY = interaction.mode === "look" || interaction.mode === "press" || interaction.mode === "pat"
        ? interaction.targetY
        : 0
      const blend = 1 - Math.exp(-14 * deltaSeconds)
      interaction.currentX += (targetX - interaction.currentX) * blend
      interaction.currentY += (targetY - interaction.currentY) * blend

      const pointerActive =
        interaction.mode === "look" ||
        interaction.mode === "press" ||
        interaction.mode === "pat" ||
        Math.abs(interaction.currentX) > 0.01 ||
        Math.abs(interaction.currentY) > 0.01
      if (!pointerActive) return

      const eyeTarget = loaded.spine.skeleton.findBone("Touch_Eye_Key")
      const pointTarget = loaded.spine.skeleton.findBone("Touch_Point_Key")
      if (eyeTarget) {
        eyeTarget.x = eyeTarget.data.x + (interaction.targetKind === "eye" ? interaction.currentX : 0)
        eyeTarget.y = eyeTarget.data.y + (interaction.targetKind === "eye" ? interaction.currentY : 0)
      }
      if (pointTarget) {
        pointTarget.x = pointTarget.data.x + (interaction.targetKind === "point" ? interaction.currentX : 0)
        pointTarget.y = pointTarget.data.y + (interaction.targetKind === "point" ? interaction.currentY : 0)
      }
      if (eyeTarget || pointTarget) loaded.spine.skeleton.updateWorldTransform(Physics.update)
    }
    app.ticker.add(updateSpine, undefined, UPDATE_PRIORITY.NORMAL)

    const fitModel = () => {
      const spine = loadedRef.current?.spine
      if (!spine || app.screen.width <= 0 || app.screen.height <= 0) return
      spine.scale.set(1)
      spine.update(0)
      const measuredBounds = spine.getLocalBounds()
      const skeletonData = spine.skeleton.data
      const bounds = memoryLobbyRef.current && skeletonData.width > 0 && skeletonData.height > 0
        ? {
            x: skeletonData.x,
            y: skeletonData.y,
            width: skeletonData.width,
            height: skeletonData.height,
          }
        : measuredBounds
      if (!bounds.width || !bounds.height) return

      const padding = Math.min(app.screen.width, app.screen.height) * 0.025
      const availableWidth = Math.max(1, app.screen.width - padding * 2)
      const availableHeight = Math.max(1, app.screen.height - padding * 2)
      const fittedScale = memoryLobbyRef.current
        ? Math.max(availableWidth / bounds.width, availableHeight / bounds.height)
        : Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
      const finalScale = fittedScale * Math.max(0.05, asset.scale ?? 1)
      spine.scale.set(finalScale)
      spine.x = app.screen.width / 2 - (bounds.x + bounds.width / 2) * finalScale + (asset.offset_x ?? 0)
      spine.y = memoryLobbyRef.current
        ? app.screen.height / 2 - (bounds.y + bounds.height / 2) * finalScale + (asset.offset_y ?? 0)
        : app.screen.height - padding - (bounds.y + bounds.height) * finalScale + (asset.offset_y ?? 0)
    }

    const observer = new ResizeObserver(() => {
      if (host.clientWidth <= 0 || host.clientHeight <= 0) return
      app.renderer.resize(host.clientWidth, host.clientHeight)
      requestAnimationFrame(fitModel)
    })
    observer.observe(host)

    const handleVisibility = () => {
      if (document.hidden) app.ticker.stop()
      else app.ticker.start()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    setReady(false)
    setInteractive(false)
    void loadSpineAsset(asset, abortController.signal)
      .then((loaded) => {
        if (disposed) {
          loaded.dispose()
          return
        }
        loadedRef.current = loaded
        animationNamesRef.current = new Set(loaded.animations)
        interactionAnimationsRef.current = resolveSpineInteractionAnimations(loaded.animations)
        setInteractive(interactionAnimationsRef.current.all.size > 0)
        app.stage.addChild(loaded.spine)

        if (asset.default_skin && loaded.skins.includes(asset.default_skin)) {
          loaded.spine.skeleton.setSkinByName(asset.default_skin)
          loaded.spine.skeleton.setSlotsToSetupPose()
        }
        const idleAnimation =
          (asset.idle_animation && loaded.animations.includes(asset.idle_animation) ? asset.idle_animation : "") ||
          loaded.animations.find((name) => name.toLowerCase() === "idle_01") ||
          loaded.animations.find((name) => name.toLowerCase().includes("idle")) ||
          loaded.animations[0] ||
          ""
        const startupAnimation = loaded.animations.find(
          (name) => name.toLowerCase() === "start_idle_01",
        ) || ""
        memoryLobbyRef.current = Boolean(startupAnimation)
        startupPendingRef.current = Boolean(startupAnimation)
        idleAnimationRef.current = idleAnimation
        if (startupAnimation) {
          loaded.spine.state.setAnimation(0, startupAnimation, false)
          if (idleAnimation) loaded.spine.state.addAnimation(0, idleAnimation, true, 0)
          const startupDuration = loaded.spine.skeleton.data.findAnimation(startupAnimation)?.duration ?? 0
          startupFitTimer = window.setTimeout(
            () => {
              startupPendingRef.current = false
              playMappedAction(
                loaded.spine,
                animationNamesRef.current,
                idleAnimation,
                actionMapping(activeActionRef.current),
              )
              requestAnimationFrame(fitModel)
            },
            Math.max(0, startupDuration * 1000),
          )
        } else if (idleAnimation) {
          loaded.spine.state.setAnimation(0, idleAnimation, true)
          playMappedAction(loaded.spine, animationNamesRef.current, idleAnimation, actionMapping(activeActionRef.current))
        }
        requestAnimationFrame(() => {
          fitModel()
          requestAnimationFrame(() => {
            if (!disposed) {
              setReady(true)
              onReadyRef.current?.()
            }
          })
        })
      })
      .catch((error: unknown) => {
        if (disposed || abortController.signal.aborted) return
        const normalized = error instanceof Error ? error : new Error(String(error))
        onErrorRef.current?.(normalized)
      })

    return () => {
      disposed = true
      abortController.abort()
      if (startupFitTimer !== undefined) window.clearTimeout(startupFitTimer)
      memoryLobbyRef.current = false
      startupPendingRef.current = false
      observer.disconnect()
      document.removeEventListener("visibilitychange", handleVisibility)
      app.ticker.remove(updateSpine)
      const releaseTimer = pointerInteractionRef.current.releaseTimer
      if (releaseTimer) window.clearTimeout(releaseTimer)
      pointerInteractionRef.current = initialInteractionState()
      loadedRef.current?.dispose()
      loadedRef.current = null
      appRef.current = null
      animationNamesRef.current = new Set()
      interactionAnimationsRef.current = resolveSpineInteractionAnimations([])
      app.destroy(true, { children: false })
    }
  }, [assetKey])

  useEffect(() => {
    const spine = loadedRef.current?.spine
    if (!spine || startupPendingRef.current) return
    const releaseTimer = pointerInteractionRef.current.releaseTimer
    if (releaseTimer) window.clearTimeout(releaseTimer)
    pointerInteractionRef.current = initialInteractionState()
    playMappedAction(spine, animationNamesRef.current, idleAnimationRef.current, actionMapping(activeAction))
  }, [activeAction?.action, activeAction?.performanceID, activeAction?.time])

  const updatePointerTarget = (event: PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const interaction = pointerInteractionRef.current
    const normalizedX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const normalizedY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    const xRange = interaction.targetKind === "point" ? 55 : 72
    const yRange = interaction.targetKind === "point" ? 36 : 46
    interaction.targetX = (normalizedX - 0.5) * xRange
    interaction.targetY = (0.5 - normalizedY) * yRange
  }

  const hitInteractionZone = (event: PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    const spine = loadedRef.current?.spine
    if (!host || !spine) return undefined
    const rect = host.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    const bounds = spine.getBounds()
    const padding = Math.max(6, Math.min(bounds.width, bounds.height) * 0.025)
    if (
      localX < bounds.x - padding ||
      localX > bounds.x + bounds.width + padding ||
      localY < bounds.y - padding ||
      localY > bounds.y + bounds.height + padding ||
      !bounds.height
    ) return undefined
    return spineInteractionZone((localY - bounds.y) / bounds.height)
  }

  const startLook = () => {
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    if (
      !spine ||
      !animations.lookMain ||
      interaction.mode === "pat" ||
      interaction.mode === "reaction" ||
      Date.now() < interaction.cooldownUntil ||
      !interactionTrackAvailable(spine, animations)
    ) return
    if (interaction.mode !== "look" && interaction.mode !== "press") {
      playLayeredInteraction(spine, animations.lookMain, animations.lookAux, true)
    }
    interaction.mode = "look"
    interaction.targetKind = "eye"
  }

  const finishLook = () => {
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    if (!spine || (interaction.mode !== "look" && interaction.mode !== "press")) return
    interaction.mode = "none"
    interaction.pointerId = undefined
    interaction.targetX = 0
    interaction.targetY = 0
    if (!playLayeredInteraction(spine, animations.lookEndMain, animations.lookEndAux, false)) {
      spine.state.setEmptyAnimation(1, 0.12)
      spine.state.setEmptyAnimation(2, 0.12)
    }
  }

  const finishPat = () => {
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    if (!spine || interaction.mode !== "pat") return
    interaction.mode = "none"
    interaction.pointerId = undefined
    interaction.targetX = 0
    interaction.targetY = 0
    interaction.cooldownUntil = Date.now() + 650
    interaction.releaseTimer = undefined
    if (!playLayeredInteraction(spine, animations.patEndMain, animations.patEndAux, false)) {
      spine.state.setEmptyAnimation(1, 0.12)
      spine.state.setEmptyAnimation(2, 0.12)
    }
  }

  const playRandomReaction = () => {
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    if (!spine || !interactionTrackAvailable(spine, animations) || Date.now() < interaction.cooldownUntil) return
    const reaction = pickSpineReaction(animations.reactions, interaction.lastReaction)
    if (!reaction) return
    interaction.lastReaction = reaction
    interaction.mode = "reaction"
    interaction.targetKind = "eye"
    interaction.targetX = 0
    interaction.targetY = 0
    interaction.cooldownUntil = Date.now() + 1100
    playLayeredInteraction(spine, reaction, undefined, false)
    const durationMs = Math.max(650, (spine.skeleton.data.findAnimation(reaction)?.duration ?? 0.5) * 1000 + 160)
    if (interaction.releaseTimer) window.clearTimeout(interaction.releaseTimer)
    interaction.releaseTimer = window.setTimeout(() => {
      const current = pointerInteractionRef.current
      if (current.mode === "reaction") current.mode = "none"
      current.releaseTimer = undefined
    }, durationMs)
  }

  const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    updatePointerTarget(event)
    startLook()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = pointerInteractionRef.current
    updatePointerTarget(event)
    if (interaction.mode === "pat") return
    if (interaction.mode === "press") {
      const distance = Math.hypot(event.clientX - interaction.pressedX, event.clientY - interaction.pressedY)
      if (distance <= 12) return
      interaction.mode = "look"
    }
    startLook()
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0) return
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    const zone = hitInteractionZone(event)
    if (
      !spine ||
      !zone ||
      Date.now() < interaction.cooldownUntil
    ) return

    if (interaction.releaseTimer) {
      window.clearTimeout(interaction.releaseTimer)
      interaction.releaseTimer = undefined
    }
    interaction.pointerId = event.pointerId
    interaction.pressedAt = performance.now()
    interaction.pressedX = event.clientX
    interaction.pressedY = event.clientY
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some Electron drag-region combinations do not permit pointer capture.
    }

    // Explicit user input takes priority over a lingering agent performance.
    // Passive hover still waits for the performance track to become available.

    if (zone === "head" && animations.patMain) {
      interaction.mode = "pat"
      interaction.targetKind = "point"
      updatePointerTarget(event)
      playLayeredInteraction(spine, animations.patMain, animations.patAux, true)
    } else {
      interaction.mode = "press"
      interaction.targetKind = "eye"
      updatePointerTarget(event)
      if (animations.lookMain) playLayeredInteraction(spine, animations.lookMain, animations.lookAux, true)
    }
    event.preventDefault()
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = pointerInteractionRef.current
    if (interaction.pointerId !== event.pointerId) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture may already have been released by the window manager.
    }

    if (interaction.mode === "pat") {
      const remainingMs = Math.max(0, 280 - (performance.now() - interaction.pressedAt))
      interaction.releaseTimer = window.setTimeout(finishPat, remainingMs)
      return
    }
    if (interaction.mode === "press") {
      const distance = Math.hypot(event.clientX - interaction.pressedX, event.clientY - interaction.pressedY)
      interaction.pointerId = undefined
      if (distance <= 12) playRandomReaction()
      else finishLook()
    } else if (interaction.mode === "look") {
      finishLook()
    }
  }

  const handlePointerCancel = () => {
    const interaction = pointerInteractionRef.current
    if (interaction.mode === "pat") finishPat()
    else finishLook()
  }

  const handlePointerLeave = () => {
    const interaction = pointerInteractionRef.current
    if (interaction.mode === "look") finishLook()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    playRandomReaction()
  }

  return (
    <div
      ref={hostRef}
      className={cn(
        className,
        "overflow-hidden",
        !ready && "pointer-events-none opacity-0",
        ready && interactive && "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
      )}
      role={ready ? (interactive ? "button" : "img") : undefined}
      tabIndex={ready && interactive ? 0 : undefined}
      aria-hidden={!ready}
      aria-label={ready ? (interactive ? "动态 Spine 角色；移动指针或点击角色可以互动" : "动态 Spine 角色") : undefined}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
    />
  )
}
