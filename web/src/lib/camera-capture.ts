import {
  replyCameraCapture,
  type PendingCameraCapture,
} from "./agent-client"
import { cameraErrorMessage, captureCameraFrame } from "./camera-frame"

const handledRequests = new Set<string>()

function isPrimaryCameraSurface() {
  const page = new URLSearchParams(window.location.search).get("page")
  return page === null || page === "chat"
}

async function captureAndReply(request: PendingCameraCapture) {
  if (handledRequests.has(request.id) || !isPrimaryCameraSurface()) return
  handledRequests.add(request.id)
  let replied = false
  try {
    const facingMode = request.facingMode === "environment" ? "environment" : "user"
    const capture = await captureCameraFrame(facingMode)
    replied = await replyCameraCapture(request.id, capture)
  } catch (error) {
    replied = await replyCameraCapture(request.id, undefined, cameraErrorMessage(error)).catch(() => false)
  }
  if (!replied) handledRequests.delete(request.id)
}

export async function handleCameraCaptureRequest(request: PendingCameraCapture) {
  if (!request?.id || handledRequests.has(request.id) || !isPrimaryCameraSurface()) return
  const lockManager = navigator.locks
  if (!lockManager) {
    await captureAndReply(request)
    return
  }
  await lockManager.request(
    `monagent-camera-capture:${request.id}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return
      await captureAndReply(request)
    },
  )
}
