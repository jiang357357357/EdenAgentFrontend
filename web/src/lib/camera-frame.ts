const CAMERA_READY_TIMEOUT_MS = 15_000

export function cameraErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return String(error)
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "摄像头权限被拒绝，请在系统或浏览器设置中允许 Eden Agent 使用摄像头。"
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "当前设备没有检测到可用摄像头。"
  }
  if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    return "摄像头当前无法读取，可能正被其他应用占用。"
  }
  return error.message || "摄像头采集失败。"
}

function waitForCameraFrame(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error("等待摄像头画面超时。"))
    }, CAMERA_READY_TIMEOUT_MS)
    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener("loadeddata", onReady)
      video.removeEventListener("error", onError)
    }
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error("摄像头视频流加载失败。"))
    }
    video.addEventListener("loadeddata", onReady, { once: true })
    video.addEventListener("error", onError, { once: true })
  })
}

export async function captureCameraFrame(facingMode: "user" | "environment" = "user") {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前环境不支持摄像头采集。")
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  })
  const video = document.createElement("video")
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  try {
    await video.play()
    await waitForCameraFrame(video)
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) throw new Error("摄像头没有返回有效画面。")
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const drawing = canvas.getContext("2d")
    if (!drawing) throw new Error("当前环境无法创建摄像头快照。")
    drawing.drawImage(video, 0, 0, width, height)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9)
    const mime = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg"
    const track = stream.getVideoTracks()[0]
    const settings = track?.getSettings()
    return {
      dataUrl,
      mime,
      width,
      height,
      deviceLabel: track?.label || undefined,
      facingMode: settings?.facingMode || facingMode,
    }
  } finally {
    video.pause()
    video.srcObject = null
    stream.getTracks().forEach((track) => track.stop())
  }
}
