function shouldAllowMediaPermission({
  permission,
  mediaType,
  mediaTypes,
  allowAudio = false,
  allowVideo = false,
}) {
  if (permission === "geolocation") return true
  if (permission !== "media") return false
  const requested = Array.isArray(mediaTypes) && mediaTypes.length
    ? mediaTypes
    : mediaType
      ? [mediaType]
      : []
  if (!requested.length) return false
  return requested.every((type) => (
    (type === "audio" && allowAudio) ||
    (type === "video" && allowVideo)
  ))
}

module.exports = {
  shouldAllowMediaPermission,
}
