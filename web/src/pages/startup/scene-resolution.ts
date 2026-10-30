export function sceneResolution(pixelRatio: number, width: number, height: number, textureLimit: number) {
  const native = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1
  const limit = Number.isFinite(textureLimit) && textureLimit > 0 ? textureLimit : Infinity
  return Math.min(native, limit / Math.max(1, width, height))
}
