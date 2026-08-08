import { ALPHA_MODES, BaseTexture } from "pixi.js"
import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonJson,
  Spine,
  SpineTexture,
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v7"
import { resolveCoreAssetUrl, type CoreCharacterSpineAsset } from "./auth"
import { isSpineAbortError, SpineAssetLoadError } from "./spine-load-policy"

export interface LoadedSpineAsset {
  spine: Spine
  animations: string[]
  skins: string[]
  version: string
  dispose: () => void
}

async function fetchAsset(url: string, label: string, signal: AbortSignal) {
  const resolved = resolveCoreAssetUrl(url)
  if (!resolved) throw new SpineAssetLoadError("asset-incomplete", `缺少 ${label} 地址`, false)
  let response: Response
  try {
    response = await fetch(resolved, { signal })
  } catch (error) {
    if (isSpineAbortError(error)) throw error
    throw new SpineAssetLoadError("network", `${label}网络读取失败`, true, { cause: error })
  }
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500
    throw new SpineAssetLoadError(
      "http",
      `${label}读取失败（${response.status}）`,
      retryable,
    )
  }
  return response
}

async function blobToImage(blob: Blob, label: string) {
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.src = url
  try {
    try {
      if (typeof image.decode === "function") {
        await image.decode()
      } else {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () => reject(new Error(`无法读取纹理：${label}`))
        })
      }
    } catch (error) {
      throw new SpineAssetLoadError("texture-decode", `无法读取纹理：${label}`, false, { cause: error })
    }
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function loadSpineAsset(asset: CoreCharacterSpineAsset, signal: AbortSignal): Promise<LoadedSpineAsset> {
  if (!asset.skeleton_url || !asset.atlas_url || !asset.textures?.length) {
    throw new SpineAssetLoadError(
      "asset-incomplete",
      "Spine 资源不完整，需要骨骼、atlas 和纹理",
      false,
    )
  }

  const [skeletonResponse, atlasResponse, textureResponses] = await Promise.all([
    fetchAsset(asset.skeleton_url, "骨骼文件", signal),
    fetchAsset(asset.atlas_url, "atlas 文件", signal),
    Promise.all(asset.textures.map((texture) => fetchAsset(texture.file_url, `纹理 ${texture.page_name}`, signal))),
  ])
  const [skeletonBuffer, atlasText, textureBlobs] = await Promise.all([
    skeletonResponse.arrayBuffer(),
    atlasResponse.text(),
    Promise.all(textureResponses.map((response) => response.blob())),
  ])

  if (signal.aborted) throw new DOMException("Spine resource loading aborted", "AbortError")

  const atlas = new TextureAtlas(atlasText)
  try {
    for (const page of atlas.pages) {
      const textureIndex = asset.textures.findIndex((texture) => texture.page_name.replace(/\\/g, "/") === page.name.replace(/\\/g, "/"))
      if (textureIndex < 0) {
        throw new SpineAssetLoadError(
          "atlas-texture-missing",
          `atlas 引用了 ${page.name}，但资源配置中没有对应纹理`,
          false,
        )
      }
      const image = await blobToImage(textureBlobs[textureIndex], page.name)
      if (signal.aborted) throw new DOMException("Spine resource loading aborted", "AbortError")
      const baseTexture = BaseTexture.from(image, {
        alphaMode: page.pma ? ALPHA_MODES.PMA : ALPHA_MODES.UNPACK,
      })
      page.setTexture(SpineTexture.from(baseTexture))
    }

    const attachmentLoader = new AtlasAttachmentLoader(atlas)
    const isJson = asset.skeleton_url.toLowerCase().split(/[?#]/)[0].endsWith(".json")
    const reader = isJson ? new SkeletonJson(attachmentLoader) : new SkeletonBinary(attachmentLoader)
    const skeletonData = isJson
      ? (reader as SkeletonJson).readSkeletonData(new TextDecoder().decode(skeletonBuffer))
      : (reader as SkeletonBinary).readSkeletonData(skeletonBuffer)
    const version = skeletonData.version || asset.runtime_version || "未知"
    if (version !== "未知" && !version.startsWith("4.2")) {
      throw new SpineAssetLoadError(
        "runtime-version",
        `资源由 Spine ${version} 导出，当前只支持 Spine 4.2`,
        false,
      )
    }

    // The canvas owns the ticker so it can apply pointer-driven bone targets
    // after the animation state and before rendering.
    const spine = new Spine({ skeletonData, autoUpdate: false })
    return {
      spine,
      animations: skeletonData.animations.map((animation) => animation.name),
      skins: skeletonData.skins.map((skin) => skin.name),
      version,
      dispose: () => {
        spine.destroy({ children: true })
        atlas.dispose()
      },
    }
  } catch (error) {
    atlas.dispose()
    if (error instanceof SpineAssetLoadError || isSpineAbortError(error)) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new SpineAssetLoadError(
      "asset-invalid",
      `Spine 资源解析失败：${message}`,
      false,
      { cause: error },
    )
  }
}
