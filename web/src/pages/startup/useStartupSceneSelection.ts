import { useMemo, useState } from 'react'
import { startupScene, type StartupScene } from './startup-assets'

export function useStartupSceneSelection(source?: StartupScene) {
  const automatic = useMemo(() => source ?? startupScene(), [source])
  const [lighting, setLighting] = useState<boolean>()
  const scene = useMemo(() => lighting === undefined || lighting === automatic.night
    ? automatic : startupScene(lighting ? 23 : 12), [automatic, lighting])
  const [poses, setPoses] = useState<Partial<Record<'day' | 'night', string>>>({})
  const key = scene.night ? 'night' : 'day'
  const pose = poses[key] ?? scene.room.idle_animation ?? 'Idle_02'
  const poseCount = scene.night ? 5 : 4
  const nextPose = () => setPoses(current => {
    const selected = current[key] ?? scene.room.idle_animation ?? 'Idle_02'
    return { ...current, [key]: `Idle_0${(Number(selected.slice(-2)) + 1) % poseCount}` }
  })
  return { scene, pose, poseCount, chooseLighting: setLighting, nextPose }
}
