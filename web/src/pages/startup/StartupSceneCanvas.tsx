import { useEffect, useRef, useState } from 'react'
import { StartupSceneRenderer } from './scene-renderer'
import { StartupDialogueBubble } from './StartupDialogueBubble'
import type { StartupScene } from './startup-assets'
import type { SceneCommand, StartupPhase } from './scene-transition'
import type { SpineBounds } from '../../components/character/renderer/spine/spine-layout'

interface Props {
  scene: StartupScene; pose?: string; phase: StartupPhase; command: SceneCommand; protectedAreas: SpineBounds[]
  onReady(): void; onActivate(): void; onPhase(value: StartupPhase): void; onError(error: unknown): void
  onForegroundBounds?(value: SpineBounds | undefined): void
}
export default function StartupSceneCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null), renderer = useRef<StartupSceneRenderer | null>(null)
  const latest = useRef(props); latest.current = props
  const [bounds, setBounds] = useState<SpineBounds>(), [renderedSource, setRenderedSource] = useState<string>()
  const ready = renderedSource === props.scene.room.skeleton_url
  useEffect(() => {
    try {
      const scene = new StartupSceneRenderer(host.current!, props.scene, {
        bounds: setBounds, ready: () => { setRenderedSource(latest.current.scene.room.skeleton_url); latest.current.onReady() },
        foreground: value => latest.current.onForegroundBounds?.(value),
        phase: value => latest.current.onPhase(value), error: error => latest.current.onError(error),
      })
      renderer.current = scene; scene.selectPose(latest.current.pose ?? props.scene.room.idle_animation!); scene.command(latest.current.command); scene.protect(latest.current.protectedAreas)
    } catch (error) { latest.current.onError(error) }
    return () => { renderer.current?.dispose(); renderer.current = null }
  }, [])
  useEffect(() => { renderer.current?.changeScene(props.scene, props.pose) }, [props.scene])
  useEffect(() => { renderer.current?.selectPose(props.pose ?? props.scene.room.idle_animation!) }, [props.pose])
  useEffect(() => { renderer.current?.command(props.command) }, [props.command])
  useEffect(() => { renderer.current?.protect(props.protectedAreas) }, [props.protectedAreas])
  return <>
    <div ref={host} data-startup-renderer className={`absolute inset-0 ${renderedSource ? 'opacity-100' : 'opacity-0'}`} />
    {ready && bounds && props.phase === 'room' ? <button type="button" aria-label={`呼唤${props.scene.name}，打开登录`}
      onClick={props.onActivate} style={{ position: 'absolute', left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
      className="cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-highlight/80" /> : null}
    {ready && bounds && props.phase === 'room' ? <StartupDialogueBubble key={`${props.scene.night}-${props.pose}`} name={props.scene.name}
      night={props.scene.night} pose={props.pose ?? props.scene.room.idle_animation!} actor={bounds}
      viewport={{ width: host.current?.clientWidth ?? 0, height: host.current?.clientHeight ?? 0 }} /> : null}
  </>
}
