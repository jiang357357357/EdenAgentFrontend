import { Application, UPDATE_PRIORITY } from "pixi.js"
import { Physics, Spine, VertexAttachment } from "@esotericsoftware/spine-pixi-v7"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import type { ActiveCharacterAction, CoreCharacterSpineAsset } from "../../../../lib/auth"
import { loadSpineAsset, type LoadedSpineAsset } from "../../../../lib/spine-loader"
import {
  pickSpineInteractionPair,
  pickSpineReaction,
  randomSpineDelayMs,
  resolveSpineInteractionAnimations,
  spineInteractionZone,
  type SpineInteractionAnimations,
} from "../../../../lib/spine-interactions"
import { cn } from "../../../../lib/utils"
import { reportPerformanceDiagnostic } from "../../../../lib/desktop-window"
import { listenDesktopGlobalPetPointer } from "../../../../lib/desktop-window"
import {
  actionMapping,
  interactionTrackAvailable,
  playBlinkAnimation,
  playHeldInteraction,
  playLayeredInteraction,
  playMappedAction,
} from "./spine-actions"
import { initialInteractionState, type InteractionZone, type PointerInteractionState } from "./spine-interactions"
import {
  calculateVertexBounds,
  calculateSpinePlacement,
  MEMORY_LOBBY_CAMERA_SCALE,
  MEMORY_LOBBY_CAMERA_Y_BIAS,
  resolveMemoryLobbyCameraSlots,
  type SpineBounds,
  type SpineLayout,
} from "./spine-layout"

function getAttachmentBounds(model: Spine, slotName: string): SpineBounds | undefined {
  model.skeleton.updateWorldTransform(Physics.update)
  const slot = model.skeleton.findSlot(slotName)
  const attachment = slot?.getAttachment()
  if (!slot || !(attachment instanceof VertexAttachment)) return undefined

  const vertices = new Float32Array(attachment.worldVerticesLength)
  attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, vertices, 0, 2)
  return calculateVertexBounds(vertices)
}

function getLargestAttachmentBounds(model: Spine): SpineBounds | undefined {
  return model.skeleton.slots
    .map((slot) => getAttachmentBounds(model, slot.data.name))
    .filter((bounds): bounds is SpineBounds => bounds !== undefined)
    .sort((left, right) => right.width * right.height - left.width * left.height)[0]
}

interface ViewportPoint {
  x: number
  y: number
}

function getBoneViewportPoint(model: Spine, names: string[]): ViewportPoint | undefined {
  const bone = names.map((name) => model.skeleton.findBone(name)).find((candidate) => candidate !== null)
  if (!bone) return undefined
  return model.toGlobal({ x: bone.worldX, y: bone.worldY })
}

function midpoint(left?: ViewportPoint, right?: ViewportPoint): ViewportPoint | undefined {
  if (!left) return right
  if (!right) return left
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
}

function withinRadius(point: ViewportPoint, center: ViewportPoint | undefined, radius: number) {
  return Boolean(center && Math.hypot(point.x - center.x, point.y - center.y) <= radius)
}

interface SpineCharacterCanvasProps {
  asset: CoreCharacterSpineAsset
  activeAction?: ActiveCharacterAction
  className?: string
  renderQuality?: "default" | "preview"
  onError?: (error: Error) => void
  onReady?: () => void
  globalPointerEnabled?: boolean
}

export function SpineCharacterCanvas({
  asset,
  activeAction,
  className,
  renderQuality = "default",
  onError,
  onReady,
  globalPointerEnabled = false,
}: SpineCharacterCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const loadedRef = useRef<LoadedSpineAsset | null>(null)
  const idleAnimationRef = useRef("")
  const layoutRef = useRef<SpineLayout>(asset.layout)
  const cameraBoundsRef = useRef<SpineBounds | undefined>(undefined)
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
    layout: asset.layout,
    metadata: asset.metadata,
    renderQuality,
  }), [asset, renderQuality])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    layoutRef.current = asset.layout
    cameraBoundsRef.current = undefined

    const abortController = new AbortController()
    let disposed = false
    let startupFitTimer: number | undefined
    let readyFitFrame: number | undefined
    let blinkTimer: number | undefined
    let rareIdleTimer: number | undefined
    let readyReported = false
    let diagnosticTicks = 0
    let diagnosticUpdateMs = 0
    let diagnosticStartedAt = performance.now()
    const rendererResolution = Math.min(window.devicePixelRatio || 1, 2)
    const app = new Application({
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: rendererResolution,
      backgroundAlpha: 0,
    })
    app.ticker.maxFPS = renderQuality === "preview" ? 15 : 24
    const canvas = app.view as HTMLCanvasElement
    canvas.className = "block h-full w-full"
    canvas.setAttribute("aria-hidden", "true")
    host.appendChild(canvas)
    appRef.current = app

    const updateSpine = () => {
      const loaded = loadedRef.current
      if (!loaded) return
      const updateStartedAt = performance.now()
      const deltaSeconds = Math.min(0.05, Math.max(0, app.ticker.elapsedMS / 1000))
      loaded.spine.update(deltaSeconds)
      diagnosticTicks += 1
      diagnosticUpdateMs += performance.now() - updateStartedAt
      const diagnosticElapsed = performance.now() - diagnosticStartedAt
      if (diagnosticElapsed >= 5_000) {
        void reportPerformanceDiagnostic("spine-renderer", {
          ticksPer5s: diagnosticTicks,
          tickerFPS: Math.round(app.ticker.FPS),
          updateTotalMs: Math.round(diagnosticUpdateMs),
          updateAverageMs: diagnosticTicks ? Number((diagnosticUpdateMs / diagnosticTicks).toFixed(3)) : 0,
          canvasCssWidth: host.clientWidth,
          canvasCssHeight: host.clientHeight,
          canvasPixelWidth: app.renderer.width,
          canvasPixelHeight: app.renderer.height,
          resolution: app.renderer.resolution,
          interactionMode: pointerInteractionRef.current.mode,
          visible: !document.hidden,
          focused: document.hasFocus(),
        })
        diagnosticTicks = 0
        diagnosticUpdateMs = 0
        diagnosticStartedAt = performance.now()
      }

      const interaction = pointerInteractionRef.current
      const targetX = interaction.mode === "look" || interaction.mode === "pat"
        ? interaction.targetX
        : 0
      const targetY = interaction.mode === "look" || interaction.mode === "pat"
        ? interaction.targetY
        : 0
      const blend = 1 - Math.exp(-14 * deltaSeconds)
      interaction.currentX += (targetX - interaction.currentX) * blend
      interaction.currentY += (targetY - interaction.currentY) * blend

      const pointerActive =
        interaction.mode === "look" ||
        interaction.mode === "pat" ||
        Math.abs(interaction.currentX) > 0.01 ||
        Math.abs(interaction.currentY) > 0.01
      if (!pointerActive) return

      const eyeTarget = loaded.spine.skeleton.findBone("Touch_Eye")
        ?? loaded.spine.skeleton.findBone("Touch_Eye_Key")
      const pointTarget = loaded.spine.skeleton.findBone("Touch_Point")
        ?? loaded.spine.skeleton.findBone("Touch_Point_Key")
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
      if (!spine || app.screen.width <= 0 || app.screen.height <= 0) return false
      spine.scale.set(1)
      spine.update(0)
      const memoryLobby = layoutRef.current === "memory-lobby"
      const bounds = memoryLobby ? cameraBoundsRef.current ?? spine.getLocalBounds() : spine.getLocalBounds()
      const padding = memoryLobby ? 0 : Math.min(app.screen.width, app.screen.height) * 0.025
      const placement = calculateSpinePlacement({
        bounds,
        viewportWidth: app.screen.width,
        viewportHeight: app.screen.height,
        padding,
        assetScale: (asset.scale ?? 1) * (memoryLobby ? MEMORY_LOBBY_CAMERA_SCALE : 1),
        offsetX: asset.offset_x,
        offsetY: (asset.offset_y ?? 0) + (memoryLobby ? app.screen.height * MEMORY_LOBBY_CAMERA_Y_BIAS : 0),
        fit: memoryLobby ? "cover" : "contain",
        verticalAlignment: memoryLobby ? "center" : "bottom",
      })
      if (!placement) return false
      spine.scale.set(placement.scale)
      spine.x = placement.x
      spine.y = placement.y
      app.render()
      return true
    }

    const markReady = () => {
      if (disposed || readyReported) return
      readyReported = true
      setReady(true)
      onReadyRef.current?.()
    }

    const fitUntilReady = (attempt = 0) => {
      if (disposed || readyReported) return
      if (fitModel()) {
        markReady()
        return
      }
      // Spine bounds can still be empty during the first frame after an
      // animation/skin is installed. Retrying avoids leaving the preview as a
      // permanently transparent canvas because of that one-frame race.
      if (attempt < 30) {
        readyFitFrame = window.requestAnimationFrame(() => fitUntilReady(attempt + 1))
        return
      }
      onErrorRef.current?.(new Error("Spine 角色边界在初始化后仍不可用"))
    }

    const observer = new ResizeObserver(() => {
      if (host.clientWidth <= 0 || host.clientHeight <= 0) return
      app.renderer.resize(host.clientWidth, host.clientHeight)
      requestAnimationFrame(() => {
        if (readyReported) fitModel()
        else fitUntilReady()
      })
    })
    observer.observe(host)

    let isIntersecting = true
    const updateTickerState = () => {
      // Desktop pet windows intentionally stay unfocused while the user works
      // in another application. Focus therefore cannot represent visibility:
      // stopping here leaves a newly loaded Spine model permanently transparent
      // until an unrelated resize happens to force Pixi to render one frame.
      if (document.hidden || !isIntersecting) app.ticker.stop()
      else app.ticker.start()
    }
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isIntersecting = entry?.isIntersecting ?? false
      updateTickerState()
    })
    visibilityObserver.observe(host)
    const handleVisibility = () => updateTickerState()
    document.addEventListener("visibilitychange", handleVisibility)
    updateTickerState()

    const scheduleBlink = (delayMs = randomSpineDelayMs(12, 15)) => {
      if (blinkTimer !== undefined) window.clearTimeout(blinkTimer)
      blinkTimer = window.setTimeout(() => {
        const loaded = loadedRef.current
        const blink = interactionAnimationsRef.current.blink
        if (!disposed && !document.hidden && loaded && blink) {
          playBlinkAnimation(loaded.spine, blink)
        }
        if (!disposed) scheduleBlink()
      }, delayMs)
    }

    const scheduleRareIdle = (additionalDelayMs = 0) => {
      if (rareIdleTimer !== undefined) window.clearTimeout(rareIdleTimer)
      rareIdleTimer = window.setTimeout(() => {
        const loaded = loadedRef.current
        const animations = interactionAnimationsRef.current
        const interaction = pointerInteractionRef.current
        const rareIdle = animations.rareIdle
        if (
          !disposed &&
          !document.hidden &&
          layoutRef.current === "memory-lobby" &&
          loaded &&
          rareIdle &&
          interaction.mode === "none" &&
          interactionTrackAvailable(loaded.spine, animations)
        ) {
          const durationMs = Math.max(
            0,
            (loaded.spine.skeleton.data.findAnimation(rareIdle)?.duration ?? 0) * 1000,
          )
          interaction.blockedUntil = Date.now() + durationMs + 300
          loaded.spine.state.setAnimation(4, rareIdle, false)
          loaded.spine.state.addEmptyAnimation(4, 0.3, 0)
          scheduleRareIdle(durationMs)
          return
        }
        if (!disposed) scheduleRareIdle()
      }, additionalDelayMs + randomSpineDelayMs(70, 80))
    }

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
        layoutRef.current = asset.layout
        if (layoutRef.current === "memory-lobby") {
          cameraBoundsRef.current = resolveMemoryLobbyCameraSlots(asset.metadata)
            .map((slotName) => getAttachmentBounds(loaded.spine, slotName))
            .find((bounds) => bounds !== undefined)
            ?? getLargestAttachmentBounds(loaded.spine)
        }
        const shouldPlayStartup = Boolean(startupAnimation) && layoutRef.current !== "memory-lobby"
        startupPendingRef.current = shouldPlayStartup
        idleAnimationRef.current = idleAnimation
        if (shouldPlayStartup) {
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
                actionMapping(activeActionRef.current, asset.layout, asset.costume_key),
              )
              requestAnimationFrame(fitModel)
            },
            Math.max(0, startupDuration * 1000),
          )
        } else if (idleAnimation) {
          loaded.spine.state.setAnimation(0, idleAnimation, true)
          playMappedAction(
            loaded.spine,
            animationNamesRef.current,
            idleAnimation,
            actionMapping(activeActionRef.current, asset.layout, asset.costume_key),
          )
        }
        if (interactionAnimationsRef.current.blink) scheduleBlink(3_000)
        if (layoutRef.current === "memory-lobby") {
          if (interactionAnimationsRef.current.rareIdle) scheduleRareIdle()
        }
        readyFitFrame = window.requestAnimationFrame(() => fitUntilReady())
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
      if (readyFitFrame !== undefined) window.cancelAnimationFrame(readyFitFrame)
      if (blinkTimer !== undefined) window.clearTimeout(blinkTimer)
      if (rareIdleTimer !== undefined) window.clearTimeout(rareIdleTimer)
      layoutRef.current = "standee"
      cameraBoundsRef.current = undefined
      startupPendingRef.current = false
      observer.disconnect()
      visibilityObserver.disconnect()
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
    playMappedAction(
      spine,
      animationNamesRef.current,
      idleAnimationRef.current,
      actionMapping(activeAction, asset.layout, asset.costume_key),
    )
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

  const hitInteractionZone = (event: PointerEvent<HTMLDivElement>): InteractionZone | undefined => {
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

    const point = { x: localX, y: localY }
    const scale = Math.max(Math.abs(spine.scale.x), Math.abs(spine.scale.y), 0.01)
    const animations = interactionAnimationsRef.current
    const eyeCenter = getBoneViewportPoint(spine, ["Touch_Eye", "Touch_Eye_Key"])
    const headCenter = getBoneViewportPoint(spine, ["Touch_Point", "Touch_Point_Key", "Head_Rot"])
    const cheekCenter = midpoint(
      getBoneViewportPoint(spine, ["nose", "face"]),
      getBoneViewportPoint(spine, ["mouth", "M_chin"]),
    )
    if (animations.lookMain && withinRadius(point, eyeCenter, 105 * scale)) return "eye"
    if (animations.pinchMain && withinRadius(point, cheekCenter, 135 * scale)) return "cheek"
    if (animations.patMain && withinRadius(point, headCenter, 190 * scale)) return "head"
    return spineInteractionZone((localY - bounds.y) / bounds.height)
  }

  const startLook = () => {
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    if (
      !spine ||
      !animations.lookMain ||
      interaction.mode !== "press" ||
      interaction.pressedZone !== "eye" ||
      Date.now() < interaction.cooldownUntil ||
      Date.now() < interaction.blockedUntil ||
      !interactionTrackAvailable(spine, animations)
    ) return
    playHeldInteraction(
      spine,
      animations.lookMain,
      animations.lookAux,
      animations.lookHoldMain,
      animations.lookHoldAux,
    )
    interaction.mode = "look"
    interaction.targetKind = "eye"
  }

  const startPat = () => {
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    if (!spine || !animations.patMain || !interactionTrackAvailable(spine, animations)) return false
    interaction.mode = "pat"
    interaction.targetKind = "point"
    return playHeldInteraction(
      spine,
      animations.patMain,
      animations.patAux,
      animations.patHoldMain,
      animations.patHoldAux,
    )
  }

  const startPinch = () => {
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    if (!spine || !animations.pinchMain || !interactionTrackAvailable(spine, animations)) return false
    interaction.mode = "pinch"
    interaction.targetKind = "eye"
    interaction.targetX = 0
    interaction.targetY = 0
    return playHeldInteraction(
      spine,
      animations.pinchMain,
      animations.pinchAux,
      animations.pinchHoldMain,
      animations.pinchHoldAux,
    )
  }

  const finishLook = () => {
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    if (!spine || interaction.mode !== "look") return
    interaction.mode = "none"
    interaction.pointerId = undefined
    interaction.pressedZone = undefined
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
    interaction.pressedZone = undefined
    interaction.targetX = 0
    interaction.targetY = 0
    interaction.cooldownUntil = Date.now() + 650
    interaction.releaseTimer = undefined
    if (!playLayeredInteraction(spine, animations.patEndMain, animations.patEndAux, false)) {
      spine.state.setEmptyAnimation(1, 0.12)
      spine.state.setEmptyAnimation(2, 0.12)
    }
  }

  const finishPinch = () => {
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    if (!spine || interaction.mode !== "pinch") return
    interaction.mode = "none"
    interaction.pointerId = undefined
    interaction.pressedZone = undefined
    interaction.targetX = 0
    interaction.targetY = 0
    interaction.cooldownUntil = Date.now() + 650
    interaction.releaseTimer = undefined
    if (!playLayeredInteraction(spine, animations.pinchEndMain, animations.pinchEndAux, false)) {
      spine.state.setEmptyAnimation(1, 0.12)
      spine.state.setEmptyAnimation(2, 0.12)
    }
  }

  const playTapReaction = () => {
    const spine = loadedRef.current?.spine
    const animations = interactionAnimationsRef.current
    const interaction = pointerInteractionRef.current
    if (
      !spine ||
      !interactionTrackAvailable(spine, animations) ||
      Date.now() < interaction.cooldownUntil ||
      Date.now() < interaction.blockedUntil
    ) return
    const reaction = pickSpineReaction(animations.reactions, interaction.lastReaction)
    const talk = reaction ? undefined : pickSpineInteractionPair(animations.talks, interaction.lastReaction)
    const main = reaction ?? talk?.main
    if (!main) return
    interaction.lastReaction = main
    interaction.mode = "reaction"
    interaction.targetKind = "eye"
    interaction.targetX = 0
    interaction.targetY = 0
    interaction.cooldownUntil = Date.now() + 1100
    playLayeredInteraction(spine, main, talk?.aux, false)
    const durationMs = Math.max(650, (spine.skeleton.data.findAnimation(main)?.duration ?? 0.5) * 1000 + 160)
    if (interaction.releaseTimer) window.clearTimeout(interaction.releaseTimer)
    interaction.releaseTimer = window.setTimeout(() => {
      const current = pointerInteractionRef.current
      if (current.mode === "reaction") current.mode = "none"
      current.releaseTimer = undefined
    }, durationMs)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = pointerInteractionRef.current
    if (interaction.pointerId !== event.pointerId) return
    updatePointerTarget(event)
    if (interaction.mode === "pat" || interaction.mode === "pinch") return
    if (interaction.mode === "press") {
      const distance = Math.hypot(event.clientX - interaction.pressedX, event.clientY - interaction.pressedY)
      if (distance <= 12) return
      startLook()
    }
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
      Date.now() < interaction.cooldownUntil ||
      Date.now() < interaction.blockedUntil
    ) return

    if (interaction.releaseTimer) {
      window.clearTimeout(interaction.releaseTimer)
      interaction.releaseTimer = undefined
    }
    interaction.pointerId = event.pointerId
    interaction.pressedAt = performance.now()
    interaction.pressedX = event.clientX
    interaction.pressedY = event.clientY
    interaction.pressedZone = zone
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some Electron drag-region combinations do not permit pointer capture.
    }

    if (zone === "head" && animations.patMain) {
      if (startPat()) updatePointerTarget(event)
      else interaction.mode = "press"
    } else if (zone === "cheek" && animations.pinchMain) {
      if (!startPinch()) interaction.mode = "press"
    } else {
      interaction.mode = "press"
      interaction.targetKind = "eye"
      if (zone === "eye") updatePointerTarget(event)
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
      const remainingMs = Math.max(0, 500 - (performance.now() - interaction.pressedAt))
      interaction.releaseTimer = window.setTimeout(finishPat, remainingMs)
      return
    }
    if (interaction.mode === "pinch") {
      const remainingMs = Math.max(0, 334 - (performance.now() - interaction.pressedAt))
      interaction.releaseTimer = window.setTimeout(finishPinch, remainingMs)
      return
    }
    if (interaction.mode === "press") {
      const distance = Math.hypot(event.clientX - interaction.pressedX, event.clientY - interaction.pressedY)
      interaction.mode = "none"
      interaction.pointerId = undefined
      interaction.pressedZone = undefined
      interaction.targetX = 0
      interaction.targetY = 0
      if (distance <= 12) playTapReaction()
    } else if (interaction.mode === "look") {
      finishLook()
    }
  }

  const handlePointerCancel = () => {
    const interaction = pointerInteractionRef.current
    if (interaction.mode === "pat") finishPat()
    else if (interaction.mode === "pinch") finishPinch()
    else if (interaction.mode === "look") finishLook()
    else {
      interaction.mode = "none"
      interaction.pointerId = undefined
      interaction.pressedZone = undefined
      interaction.targetX = 0
      interaction.targetY = 0
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    playTapReaction()
  }

  useEffect(() => {
    if (!globalPointerEnabled) return
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void listenDesktopGlobalPetPointer((pointer) => {
      if (disposed) return
      const host = hostRef.current
      if (!host) return
      const event = {
        button: pointer.button,
        clientX: pointer.clientX,
        clientY: pointer.clientY,
        pointerId: pointer.pointerId,
        currentTarget: host,
        preventDefault() {},
      } as unknown as PointerEvent<HTMLDivElement>
      if (pointer.phase === "down") handlePointerDown(event)
      else if (pointer.phase === "move") handlePointerMove(event)
      else if (pointer.phase === "up") handlePointerUp(event)
      else handlePointerCancel()
    }).then((cleanup) => {
      unsubscribe = cleanup
      if (disposed) cleanup?.()
    })
    return () => {
      disposed = true
      unsubscribe?.()
      handlePointerCancel()
    }
  }, [globalPointerEnabled, interactive, assetKey])

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
      aria-label={ready ? (interactive ? "动态 Spine 角色；按住、拖动或点击角色可以互动" : "动态 Spine 角色") : undefined}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
    />
  )
}
