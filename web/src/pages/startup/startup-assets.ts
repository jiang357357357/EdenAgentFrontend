import type { CoreCharacterSpineAsset } from '../../lib/auth'

export function startupScene(hour = new Date().getHours(), base = document.baseURI) {
  const night = hour < 6 || hour >= 18
  const root = new URL('startup-scene/', base)
  const asset = (name: string, room: boolean): CoreCharacterSpineAsset => ({
    skeleton_url: new URL(`${name}.skel`, root).href,
    atlas_url: new URL(`${name}.atlas`, root).href,
    textures: [name + '.png', ...(room ? [name + '_2.png'] : [])].map(page => ({ page_name: page, file_url: new URL(page, root).href })),
    idle_animation: room ? 'Idle_02' : 'Idle_01', layout: room ? 'memory-lobby' : 'standee', runtime_version: '4.2',
  })
  return { night, name: night ? '普拉娜' : '阿罗娜',
    room: asset(night ? 'arona_workpage_nighttime_2' : 'arona_workpage_daytime_2', true),
    character: asset(night ? 'NP0035_spr' : 'arona_spr', false),
    poster: new URL(night ? 'thumb-night_3.png' : 'thumb-day_3.png', root).href }
}
export type StartupScene = ReturnType<typeof startupScene>
