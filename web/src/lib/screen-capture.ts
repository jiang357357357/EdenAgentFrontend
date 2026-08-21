import { captureDesktopScreen } from './desktop-window';
import { replyScreenCapture, type PendingScreenCapture } from './agent-client';

const handledRequests = new Set<string>();

async function captureAndReply(request: PendingScreenCapture) {
  if (handledRequests.has(request.id) || !window.monAgentDesktop) return;
  handledRequests.add(request.id);
  let replied = false;
  try {
    const requestedSource = request.source === 'desktop' || request.source === 'game' ? request.source : 'auto';
    const capture = await captureDesktopScreen(requestedSource);
    replied = await replyScreenCapture(request.id, capture);
  } catch (error) {
    replied = await replyScreenCapture(
      request.id,
      undefined,
      error instanceof Error ? error.message : String(error),
    ).catch(() => false);
  }
  if (!replied) handledRequests.delete(request.id);
}

export async function handleScreenCaptureRequest(request: PendingScreenCapture) {
  if (!request?.id || !window.monAgentDesktop || handledRequests.has(request.id)) return;
  const lockManager = navigator.locks;
  if (!lockManager) {
    await captureAndReply(request);
    return;
  }
  await lockManager.request(
    `monagent-screen-capture:${request.id}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return;
      await captureAndReply(request);
    },
  );
}
