import { filterChatEvents } from '../lib/chat-event-filter';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  abortSession as abortSessionRaw,
  compactSession as compactSessionRaw,
  createSessionRaw,
  deleteSession as deleteSessionRaw,
    getPermissionMode,
    getRuntimeModelConfig,
  followUpTurn,
  getSubagentThreadDetails as getSubagentThreadDetailsRaw,
  followupSubagent as followupSubagentRaw,
  interruptSubagent as interruptSubagentRaw,
  listPermissionsRaw,
  listCameraCaptureRequests,
  listQuestionsRaw,
  listScreenCaptureRequests,
  listMessagesRaw,
  listSessionsRaw,
  readSessionRaw,
  isBackgroundSession,
  rejectQuestion,
  renameSession as renameSessionRaw,
  replyPermission,
  replyQuestion,
  sendPromptAsync,
  setPermissionMode as setPermissionModeRaw,
  updateSessionParticipants as updateSessionParticipantsRaw,
  subscribeEvents,
} from '../lib/agent-client';
import type { ApiEvent, PendingCameraCapture, PendingScreenCapture } from '../lib/agent-client';
import {
  acceptLocalUserMessage,
  applyRuntimeEvent,
  failLocalUserMessage,
  hydratePendingPermissions,
  hydratePendingQuestions,
  hydrateSessionList,
  invalidateInactiveSessions,
  hydrateSessionMessages,
  prependSessionMessages,
  pushLocalUserMessage,
  initialRuntimeState,
  resetRuntime,
  removeSession,
  runtimeReducer,
  setActiveSession,
  setSessionStatus,
  setConnectionState,
  setConnectionError,
  setLoadingOlderMessages,
} from '../lib/session-reducer';
import { selectActiveSession, selectPendingPermissions, selectPendingQuestions, selectSessions, selectSessionStatus } from '../lib/session-selectors';
import type { PermissionMode, PromptAttachment } from '../types';
import { handleScreenCaptureRequest } from '../lib/screen-capture';
import { handleCameraCaptureRequest } from '../lib/camera-capture';
import { ConnectionFeedback, initialConnectionFeedback } from '../lib/connection-feedback';
import { getRuntimeOriginRevision, getStoredRuntimeOrigin } from '../lib/runtime-origin';
import { useSessionConnectionFeedback } from './useSessionConnectionFeedback';
import { forgetSessionChannel } from '../lib/rpc-transport';

type RefreshGuard = () => boolean;
const authenticationError = /authentication_expired|not_authenticated|core_authentication_expired|Mon authentication rejected/i;

interface UseSessionRuntimeOptions {
  onEvent?: (event: ApiEvent) => void;
  defaultParticipantID?: number | string;
}

async function refreshModelWhenIdle(sessionID: string) {
  try { await getRuntimeModelConfig(sessionID); }
  catch (error) {
    // Reading the catalogue can rebind models. A busy session keeps its binding.
    if (!(error instanceof Error && error.message === 'Wait for the session to become idle before configuration')) throw error;
  }
}

export function useSessionRuntime(enabled = true, options: UseSessionRuntimeOptions = {}) {
  const [state, dispatch] = useReducer(runtimeReducer, initialRuntimeState);
  const [permissionMode, setPermissionModeState] = useState<PermissionMode>('restricted');
  const [draftParticipantIDs, setDraftParticipantIDs] = useState<Array<number | string>>([]);
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({});
  const [connectionFeedback, setConnectionFeedback] = useState(initialConnectionFeedback);
  const feedbackRevisionRef = useRef(initialConnectionFeedback.revision);
  const connectionFeedbackController = useMemo(() => new ConnectionFeedback((next) => {
    feedbackRevisionRef.current = next.revision;
    setConnectionFeedback(next);
  }), []);
  const activeSessionIdRef = useRef<string | undefined>(state.activeSessionId);
  const cachedSessionIdsRef = useRef<string[]>([]);
  cachedSessionIdsRef.current = Object.keys(state.sessions);
  const eventErrorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sendingSessionIdsRef = useRef(new Set<string>());
  const preparingSessionIdsRef = useRef(new Map<string, object>());
  const hydratingSessionIdsRef = useRef(new Map<string, object>());
  const deletedSessionIdsRef = useRef(new Set<string>());
  const onEventRef = useRef(options.onEvent);
  const defaultParticipantID = options.defaultParticipantID;

  const scopeRef = useRef({ enabled, epoch: 0, originRevision: getRuntimeOriginRevision() });
  const mountedRef = useRef(true);
  const originRevision = getRuntimeOriginRevision();
  if (scopeRef.current.enabled !== enabled || scopeRef.current.originRevision !== originRevision) {
    scopeRef.current = { enabled, epoch: scopeRef.current.epoch + 1, originRevision };
  }
  const scopeEpoch = scopeRef.current.epoch;
  const isRuntimeReady = useCallback(() => mountedRef.current && scopeRef.current.enabled
    && scopeRef.current.originRevision === getRuntimeOriginRevision(), [enabled, scopeEpoch]);
  const captureRefreshGuard = useCallback((revision = feedbackRevisionRef.current): RefreshGuard => {
    const { epoch, originRevision: origin } = scopeRef.current;
    return () => mountedRef.current && scopeRef.current.enabled && scopeRef.current.epoch === epoch
      && getRuntimeOriginRevision() === origin && connectionFeedbackController.isCurrent(revision);
  }, [connectionFeedbackController]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; scopeRef.current.epoch += 1; };
  }, []);

  useEffect(() => {
    activeSessionIdRef.current = state.activeSessionId;
  }, [state.activeSessionId]);

  useEffect(() => {
    onEventRef.current = options.onEvent;
  }, [options.onEvent]);

  useEffect(() => {
    if (activeSessionIdRef.current || defaultParticipantID === undefined || defaultParticipantID === null) return;
    setDraftParticipantIDs((current) => current.length ? current : [defaultParticipantID]);
  }, [defaultParticipantID]);

  useEffect(() => {
    for (const [sessionID, session] of Object.entries(state.sessions)) {
      if (session.status === 'idle') {
        sendingSessionIdsRef.current.delete(sessionID);
      } else {
        sendingSessionIdsRef.current.add(sessionID);
      }
    }
  }, [state.sessions]);

  useEffect(() => {
    connectionFeedbackController.reset(enabled);
    if (enabled) return;
    setModelErrors({});
    dispatch(resetRuntime());
  }, [enabled, scopeEpoch, connectionFeedbackController]);

  const refreshSessions = useCallback(async (current: RefreshGuard = captureRefreshGuard()) => {
    if (!current()) return [];
    const sessions = (await listSessionsRaw()).filter((session) => !deletedSessionIdsRef.current.has(session.id));
    if (!current()) return [];
    const visible = new Set(sessions.map((session) => session.id));
    const hidden = await Promise.all(cachedSessionIdsRef.current.filter((id) => !visible.has(id))
      .map(async (id) => await isBackgroundSession(id) ? id : undefined));
    if (!current()) return [];
    for (const id of hidden) {
      if (!id) continue;
      dispatch(removeSession(id));
      if (activeSessionIdRef.current === id) activeSessionIdRef.current = undefined;
    }
    const remaining = sessions.filter((session) => !deletedSessionIdsRef.current.has(session.id));
    dispatch(hydrateSessionList(remaining));
    return remaining;
  }, [captureRefreshGuard]);

  const refreshSessionMessages = useCallback(async (sessionID?: string, current: RefreshGuard = captureRefreshGuard()) => {
    if (!sessionID || !current()) return;
    const page = await listMessagesRaw(sessionID);
    if (!current() || deletedSessionIdsRef.current.has(sessionID)) return;
    dispatch(hydrateSessionMessages(sessionID, page));
  }, [captureRefreshGuard]);

  const channels = useSessionConnectionFeedback(enabled, scopeEpoch, state.activeSessionId, async (sessionID, live) => {
    const epoch = scopeRef.current.epoch;
    const current = () => live() && isRuntimeReady() && scopeRef.current.epoch === epoch && !deletedSessionIdsRef.current.has(sessionID);
    const [session, page] = await Promise.all([readSessionRaw(sessionID), listMessagesRaw(sessionID)]);
    if (!current() || await isBackgroundSession(sessionID) || !current()) return;
    dispatch(hydrateSessionList([session]));
    dispatch(hydrateSessionMessages(sessionID, page));
  });

  const refreshSessionModel = useCallback(async (sessionID: string, current: RefreshGuard = captureRefreshGuard(), propagateAuthentication = false) => {
    if (!current()) return;
    try {
      await refreshModelWhenIdle(sessionID);
      if (!current() || deletedSessionIdsRef.current.has(sessionID)) return;
      setModelErrors((current) => {
        if (!current[sessionID]) return current;
        const next = { ...current };
        delete next[sessionID];
        return next;
      });
    } catch (error) {
      if (!current() || deletedSessionIdsRef.current.has(sessionID)) return;
      const message = error instanceof Error ? error.message : String(error);
      if (authenticationError.test(message)) {
        dispatch(setConnectionError(message));
        if (propagateAuthentication) throw error;
        return;
      }
      setModelErrors((current) => current[sessionID] === message ? current : { ...current, [sessionID]: message });
    }
  }, [captureRefreshGuard]);

  const refreshBlockers = useCallback(async (current: RefreshGuard = captureRefreshGuard()) => {
    if (!current()) return;
    const [permissions, questions, permissionModeResponse, screenCaptureRequests, cameraCaptureRequests] = await Promise.all([
      listPermissionsRaw(),
      listQuestionsRaw(),
      getPermissionMode(),
      listScreenCaptureRequests(),
      listCameraCaptureRequests(),
    ]);
    if (!current()) return;
    dispatch(hydratePendingPermissions(permissions.filter((item) => !deletedSessionIdsRef.current.has(item.sessionID))));
    dispatch(hydratePendingQuestions(questions.filter((item) => !deletedSessionIdsRef.current.has(item.sessionID))));
    setPermissionModeState(permissionModeResponse.mode);
    for (const request of screenCaptureRequests) if (!deletedSessionIdsRef.current.has(request.sessionID)) void handleScreenCaptureRequest(request);
    for (const request of cameraCaptureRequests) if (!deletedSessionIdsRef.current.has(request.sessionID)) void handleCameraCaptureRequest(request);
  }, [captureRefreshGuard]);

  useEffect(() => {
    if (!isRuntimeReady()) return;
    let cancelled = false;
    const inScope = captureRefreshGuard();
    const current = () => !cancelled && inScope();

    async function load() {
      try {
        const sessions = await refreshSessions(current);
        if (!current()) return;
        const firstSessionID = activeSessionIdRef.current ?? sessions[0]?.id;
        if (firstSessionID) {
          await refreshSessionMessages(firstSessionID, current);
        }
        await refreshBlockers(current);
      } catch (error) {
        if (!current()) return;
        dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [captureRefreshGuard, isRuntimeReady, refreshBlockers, refreshSessionMessages, refreshSessions]);

  useEffect(() => {
    if (!isRuntimeReady() || !state.activeSessionId) return;
    void refreshSessionModel(state.activeSessionId);
  }, [isRuntimeReady, refreshSessionModel, state.activeSessionId]);

  const activeSessionHydrated = state.activeSessionId
    ? Boolean(state.sessions[state.activeSessionId]?.hydrated)
    : false;

  useEffect(() => {
    if (!isRuntimeReady()) return;
    const sessionID = state.activeSessionId;
    if (!sessionID) return;
    if (activeSessionHydrated || hydratingSessionIdsRef.current.has(sessionID)) return;

    let cancelled = false;
    const inScope = captureRefreshGuard();
    const current = () => !cancelled && inScope();
    const operation = {};
    hydratingSessionIdsRef.current.set(sessionID, operation);

    async function hydrate() {
      try {
        const page = await listMessagesRaw(sessionID);
        if (!current() || deletedSessionIdsRef.current.has(sessionID)) return;
        dispatch(hydrateSessionMessages(sessionID, page));
      } catch (error) {
        if (!current() || deletedSessionIdsRef.current.has(sessionID)) return;
        dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      } finally {
        if (hydratingSessionIdsRef.current.get(sessionID) === operation) hydratingSessionIdsRef.current.delete(sessionID);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
      if (hydratingSessionIdsRef.current.get(sessionID) === operation) hydratingSessionIdsRef.current.delete(sessionID);
    };
  }, [activeSessionHydrated, captureRefreshGuard, isRuntimeReady, state.activeSessionId]);

  const synchronizeConnection = useCallback(async (revision: number, initialConnection = false) => {
    const current = captureRefreshGuard(revision);
    if (!current()) return;
    try {
      const [sessions] = await Promise.all([refreshSessions(current), refreshBlockers(current)]);
      while (current()) {
        const selectedSessionID = activeSessionIdRef.current;
        const sessionID = selectedSessionID ?? sessions[0]?.id;
        if (sessionID) {
          await refreshSessionModel(sessionID, current, true);
          if (!current()) return;
          await refreshSessionMessages(sessionID, current);
          if (!current()) return;
        }
        // A selection made during either request needs its own snapshot.
        if (activeSessionIdRef.current !== selectedSessionID && activeSessionIdRef.current !== sessionID) continue;
        connectionFeedbackController.synchronized(revision);
        return;
      }
    } catch (error) {
      if (!current()) return;
      const reason = error instanceof Error ? error.message : String(error);
      connectionFeedbackController.synchronized(revision, reason);
      if (initialConnection || authenticationError.test(reason)) dispatch(setConnectionError(reason));
    }
  }, [captureRefreshGuard, connectionFeedbackController, refreshBlockers, refreshSessionMessages, refreshSessionModel, refreshSessions]);

  const retryConnectionSync = useCallback(() => {
    if (!isRuntimeReady()) return;
    dispatch(setConnectionError(undefined));
    void synchronizeConnection(connectionFeedbackController.synchronizing());
  }, [connectionFeedbackController, isRuntimeReady, synchronizeConnection]);
  const dismissConnectionFeedback = useCallback(() => connectionFeedbackController.dismiss(), [connectionFeedbackController]);

  useEffect(() => {
    if (!isRuntimeReady()) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const epoch = scopeRef.current.epoch;
    const currentScope = () => !disposed && isRuntimeReady() && scopeRef.current.epoch === epoch;

    void subscribeEvents({
      onOpen: () => {
        if (!currentScope()) return;
        if (eventErrorTimerRef.current) {
          clearTimeout(eventErrorTimerRef.current);
          eventErrorTimerRef.current = undefined;
        }
        dispatch(setConnectionState('connected'));
        dispatch(setConnectionError(undefined));
        const opened = connectionFeedbackController.opened();
        // The active session is refreshed now; other cached sessions must load
        // a fresh snapshot when selected after missed stream notifications.
        if (opened.recovering) dispatch(invalidateInactiveSessions());
        void synchronizeConnection(opened.revision, !opened.recovering);
      },
      onError: (error) => {
        if (!currentScope()) return;
        connectionFeedbackController.disconnected(error);
        dispatch(setConnectionState('disconnected'));
        if (eventErrorTimerRef.current) {
          clearTimeout(eventErrorTimerRef.current);
        }
        eventErrorTimerRef.current = setTimeout(() => {
          eventErrorTimerRef.current = undefined;
          if (!currentScope()) return;
          dispatch(setConnectionError(error));
        }, 2000);
      },
      onEvent: filterChatEvents(isBackgroundSession, (event) => {
        if (!currentScope()) return;
        const eventSessionID = (event.properties as { sessionID?: string }).sessionID;
        if (event.type === 'session.deleted' && eventSessionID) { deletedSessionIdsRef.current.add(eventSessionID); forgetSessionChannel(eventSessionID); }
        else if (eventSessionID && deletedSessionIdsRef.current.has(eventSessionID)) return;
        onEventRef.current?.(event);
        if (event.type === 'screen_capture.requested') {
          const request = event.properties as Partial<PendingScreenCapture> | undefined;
          if (request && typeof request.id === 'string') {
            void handleScreenCaptureRequest(request as PendingScreenCapture);
          }
        }
        if (event.type === 'camera_capture.requested') {
          const request = event.properties as Partial<PendingCameraCapture> | undefined;
          if (request && typeof request.id === 'string') {
            void handleCameraCaptureRequest(request as PendingCameraCapture);
          }
        }
        if (event.type === 'permission.mode') {
          const nextPermissionMode = event.properties.mode;
          if (nextPermissionMode === 'restricted' || nextPermissionMode === 'full_access' || nextPermissionMode === 'takeover') {
            setPermissionModeState(nextPermissionMode);
          }
        }
        dispatch(applyRuntimeEvent(event));
      }),
    })
      .then((dispose) => {
        if (!currentScope()) {
          dispose();
          return;
        }
        cleanup = dispose;
      })
      .catch((error) => {
        if (!currentScope()) return;
        const reason = error instanceof Error ? error.message : String(error);
        connectionFeedbackController.disconnected(reason);
        dispatch(setConnectionError(reason));
      });

    return () => {
      disposed = true;
      if (eventErrorTimerRef.current) {
        clearTimeout(eventErrorTimerRef.current);
        eventErrorTimerRef.current = undefined;
      }
      cleanup?.();
    };
  }, [connectionFeedbackController, isRuntimeReady, synchronizeConnection]);

  const createSession = useCallback(async () => {
    if (!isRuntimeReady()) throw new Error('Eden Agent runtime is not authenticated');
    activeSessionIdRef.current = undefined;
    setDraftParticipantIDs(defaultParticipantID === undefined || defaultParticipantID === null ? [] : [defaultParticipantID]);
    dispatch(setActiveSession(undefined));
  }, [defaultParticipantID, isRuntimeReady]);

  const chooseSession = useCallback((sessionID?: string) => {
    activeSessionIdRef.current = sessionID;
    setDraftParticipantIDs(sessionID || defaultParticipantID === undefined || defaultParticipantID === null
      ? []
      : [defaultParticipantID]);
    dispatch(setActiveSession(sessionID));
  }, [defaultParticipantID]);

  const prepareSessionForSend = useCallback(async (sessionID: string) => {
    if ((getStoredRuntimeOrigin() ?? 'mon') !== 'mon') return;
    const { epoch, originRevision } = scopeRef.current;
    const current = () => isRuntimeReady() && scopeRef.current.epoch === epoch && getRuntimeOriginRevision() === originRevision;
    const participantIDs = draftParticipantIDs.length ? [...draftParticipantIDs]
      : defaultParticipantID === undefined || defaultParticipantID === null ? [] : [defaultParticipantID];
    try {
      const session = await readSessionRaw(sessionID);
      if (!current()) throw new Error('账号或世界已切换，请重新发送');
      if (session.participants?.length) return;
      if (!participantIDs.length) throw new Error('请先为此会话选择助手，再发送消息。');
      // This existing API persists participants and resolves their model before returning.
      const prepared = await updateSessionParticipantsRaw(sessionID, participantIDs);
      if (!current()) throw new Error('账号或世界已切换，请核对原会话，勿自动重试');
      dispatch(hydrateSessionList([prepared]));
      setModelErrors(values => { const next = { ...values }; delete next[sessionID]; return next; });
    } catch (error) {
      if (current()) setModelErrors(values => ({ ...values, [sessionID]: error instanceof Error ? error.message : String(error) }));
      throw error;
    }
  }, [defaultParticipantID, draftParticipantIDs, isRuntimeReady]);

  const sendMessage = useCallback(
    async (content: string, attachments: PromptAttachment[]) => {
      let sessionID = activeSessionIdRef.current;
      if (!isRuntimeReady()) {
        throw new Error('Eden Agent runtime is not authenticated');
      }
      if (!sessionID) {
        const session = await createSessionRaw(draftParticipantIDs);
        sessionID = session.id;
        activeSessionIdRef.current = session.id;
        setDraftParticipantIDs([]);
        sendingSessionIdsRef.current.add(session.id);
        dispatch(hydrateSessionList([session]));
        dispatch(setActiveSession(session.id));
        const optimisticMessage = pushLocalUserMessage(session.id, content, attachments);
        dispatch(optimisticMessage);
        try {
          const accepted = await sendPromptAsync(session.id, content, attachments);
          if (!deletedSessionIdsRef.current.has(session.id)) dispatch(acceptLocalUserMessage(session.id, optimisticMessage.messageID, accepted.turnId));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendingSessionIdsRef.current.delete(session.id);
          if (!deletedSessionIdsRef.current.has(session.id)) {
            dispatch(failLocalUserMessage(session.id, optimisticMessage.messageID, message));
            dispatch(setConnectionError(message));
          }
          throw error;
        }
        return;
      }
      if (!sessionID) {
        throw new Error('No active session');
      }
      if (sendingSessionIdsRef.current.has(sessionID)) {
        if (attachments.length > 0) {
          throw new Error('运行中的后续消息暂不支持附件，请等待当前回合结束。');
        }
        if (!content.trim()) return;
        const optimisticMessage = pushLocalUserMessage(sessionID, content, attachments, { followUp: true });
        dispatch(optimisticMessage);
        try {
          const accepted = await followUpTurn(sessionID, content);
          if (!deletedSessionIdsRef.current.has(sessionID)) dispatch(acceptLocalUserMessage(sessionID, optimisticMessage.messageID, accepted.turnId ?? undefined));
        } catch (error) {
          if (!deletedSessionIdsRef.current.has(sessionID)) dispatch(failLocalUserMessage(
            sessionID,
            optimisticMessage.messageID,
            error instanceof Error ? error.message : String(error),
            { followUp: true },
          ));
          throw error;
        }
        return;
      }

      if (preparingSessionIdsRef.current.has(sessionID)) throw new Error('此会话正在准备助手和模型，请稍后再发送。');
      const preparation = {};
      const { epoch, originRevision } = scopeRef.current;
      preparingSessionIdsRef.current.set(sessionID, preparation);
      try {
        await prepareSessionForSend(sessionID);
        if (!isRuntimeReady() || scopeRef.current.epoch !== epoch || getRuntimeOriginRevision() !== originRevision) {
          throw new Error('账号或世界已切换，请重新发送');
        }
      } finally {
        if (preparingSessionIdsRef.current.get(sessionID) === preparation) preparingSessionIdsRef.current.delete(sessionID);
      }
      sendingSessionIdsRef.current.add(sessionID);
      const optimisticMessage = pushLocalUserMessage(sessionID, content, attachments);
      dispatch(optimisticMessage);
      try {
        const accepted = await sendPromptAsync(sessionID, content, attachments);
        if (!deletedSessionIdsRef.current.has(sessionID)) dispatch(acceptLocalUserMessage(sessionID, optimisticMessage.messageID, accepted.turnId));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendingSessionIdsRef.current.delete(sessionID);
        if (!deletedSessionIdsRef.current.has(sessionID)) {
          dispatch(failLocalUserMessage(sessionID, optimisticMessage.messageID, message));
          dispatch(setConnectionError(message));
        }
        throw error;
      }
    },
    [draftParticipantIDs, isRuntimeReady, prepareSessionForSend],
  );

  const compactSession = useCallback(async (instructions?: string) => {
    const sessionID = activeSessionIdRef.current;
    if (!isRuntimeReady()) {
      throw new Error('Eden Agent runtime is not authenticated');
    }
    if (!sessionID) {
      throw new Error('当前没有可压缩的会话。');
    }
    if (sendingSessionIdsRef.current.has(sessionID)) {
      throw new Error('智能体正在处理当前任务，请稍后再压缩。');
    }

    sendingSessionIdsRef.current.add(sessionID);
    dispatch(setSessionStatus(sessionID, 'busy'));
    dispatch(setConnectionError(undefined));
    try {
      await compactSessionRaw(sessionID, instructions);
    } catch (error) {
      sendingSessionIdsRef.current.delete(sessionID);
      if (!deletedSessionIdsRef.current.has(sessionID)) {
        dispatch(setSessionStatus(sessionID, 'idle'));
        dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      }
      throw error;
    }
  }, [isRuntimeReady]);

  const abortSession = useCallback(async () => {
    const sessionID = activeSessionIdRef.current;
    if (!isRuntimeReady()) {
      throw new Error('Eden Agent runtime is not authenticated');
    }
    if (!sessionID) {
      throw new Error('当前没有可中止的会话。');
    }

    dispatch(setConnectionError(undefined));
    dispatch(setSessionStatus(sessionID, 'stopping'));
    try {
      const result = await abortSessionRaw(sessionID);
      if (!result.aborted) {
        if (!deletedSessionIdsRef.current.has(sessionID)) dispatch(setSessionStatus(sessionID, 'idle'));
        sendingSessionIdsRef.current.delete(sessionID);
      }
      try { await refreshSessions(); }
      catch { /* The event stream can still reconcile the stop result. */ }
      return result;
    } catch (error) {
      try {
        await refreshSessions();
      } catch {
        // Preserve the abort error; the event stream can still reconcile state.
      }
      dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }, [isRuntimeReady, refreshSessions]);

  const updateSessionParticipants = useCallback(async (assistantIDs: Array<number | string>) => {
    const sessionID = activeSessionIdRef.current;
    if (!isRuntimeReady()) throw new Error('Eden Agent runtime is not authenticated');
    if (!sessionID) {
      setDraftParticipantIDs([...assistantIDs]);
      return undefined;
    }
    if (sendingSessionIdsRef.current.has(sessionID)) {
      throw new Error('智能体正在处理当前任务，请等待本轮结束后再调整会话助手。');
    }
    const session = await updateSessionParticipantsRaw(sessionID, assistantIDs);
    dispatch(hydrateSessionList([session]));
    setModelErrors((current) => {
      if (!current[sessionID]) return current;
      const next = { ...current };
      delete next[sessionID];
      return next;
    });
    return session;
  }, [isRuntimeReady]);

  const deleteSession = useCallback(async (sessionID: string) => {
    if (!isRuntimeReady()) throw new Error('Eden Agent runtime is not authenticated');
    await deleteSessionRaw(sessionID);
    deletedSessionIdsRef.current.add(sessionID);
    setModelErrors((current) => {
      if (!current[sessionID]) return current;
      const next = { ...current };
      delete next[sessionID];
      return next;
    });
    const nextSessionID = state.sessionOrder.find((id) => id !== sessionID && !deletedSessionIdsRef.current.has(id));
    sendingSessionIdsRef.current.delete(sessionID);
    hydratingSessionIdsRef.current.delete(sessionID);
    if (activeSessionIdRef.current === sessionID) {
      activeSessionIdRef.current = nextSessionID;
      if (!nextSessionID) {
        setDraftParticipantIDs(defaultParticipantID === undefined || defaultParticipantID === null ? [] : [defaultParticipantID]);
      }
    }
    dispatch(removeSession(sessionID));
  }, [defaultParticipantID, isRuntimeReady, state.sessionOrder]);

  const renameSession = useCallback(async (sessionID: string, title: string) => {
    if (!isRuntimeReady()) throw new Error('Eden Agent runtime is not authenticated');
    const normalized = title.trim();
    if (!normalized) throw new Error('会话标题不能为空。');
    const session = await renameSessionRaw(sessionID, normalized);
    dispatch(hydrateSessionList([session]));
    return session;
  }, [isRuntimeReady]);

  const interruptSubagent = useCallback(async (target: string) => {
    const sessionID = activeSessionIdRef.current;
    if (!sessionID || !isRuntimeReady()) throw new Error('当前没有可操作的会话。');
    return interruptSubagentRaw(sessionID, target);
  }, [isRuntimeReady]);

  const getSubagentThreadDetails = useCallback(async (target: string) => {
    const sessionID = activeSessionIdRef.current;
    if (!sessionID || !isRuntimeReady()) throw new Error('当前没有可操作的会话。');
    return getSubagentThreadDetailsRaw(sessionID, target);
  }, [isRuntimeReady]);

  const followupSubagent = useCallback(async (target: string, message: string) => {
    const sessionID = activeSessionIdRef.current;
    if (!sessionID || !isRuntimeReady()) throw new Error('当前没有可操作的会话。');
    return followupSubagentRaw(sessionID, target, message);
  }, [isRuntimeReady]);

  const respondPermission = useCallback(async (requestID: string, reply: 'once' | 'always' | 'reject', message?: string) => {
    await replyPermission(requestID, reply, message);
  }, []);

  const updatePermissionMode = useCallback(async (mode: PermissionMode) => {
    const response = await setPermissionModeRaw(mode);
    setPermissionModeState(response.mode);
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const sessionID = activeSessionIdRef.current;
    if (!sessionID || !isRuntimeReady()) return;
    const session = state.sessions[sessionID];
    if (!session?.hasMoreMessages || !session.messageCursor || session.loadingOlderMessages) return;
    dispatch(setLoadingOlderMessages(sessionID, true));
    try {
      const page = await listMessagesRaw(sessionID, session.messageCursor);
      dispatch(prependSessionMessages(sessionID, page));
    } catch (error) {
      dispatch(setLoadingOlderMessages(sessionID, false));
      throw error;
    }
  }, [isRuntimeReady, state.sessions]);

  const answerQuestion = useCallback(async (requestID: string, answers: string[][], supplementary?: string[]) => {
    await replyQuestion(requestID, answers, supplementary);
  }, []);

  const dismissQuestion = useCallback(async (requestID: string) => {
    await rejectQuestion(requestID);
  }, []);

  const sessions = useMemo(() => selectSessions(state), [state]);
  const activeSession = useMemo(() => selectActiveSession(state), [state]);
  const pendingPermissions = useMemo(() => selectPendingPermissions(state, state.activeSessionId), [state]);
  const pendingQuestions = useMemo(() => selectPendingQuestions(state, state.activeSessionId), [state]);
  const allPendingQuestions = useMemo(() => selectPendingQuestions(state), [state]);
  const isThinking = selectSessionStatus(state, state.activeSessionId) !== 'idle';
  const activeSessionError = state.activeSessionId ? state.sessions[state.activeSessionId]?.error : undefined;
  const activeModelError = state.activeSessionId ? modelErrors[state.activeSessionId] : undefined;

  return {
    activeSession,
    activeSessionId: state.activeSessionId ?? '',
    activeSessionError,
    abortSession,
    answerQuestion,
    connectionState: channels.feedback ? (channels.feedback.phase === 'reconnecting' ? 'disconnected' : 'connected') : state.connectionState,
    connectionFeedback: channels.feedback ?? connectionFeedback,
    sessionConnectionStates: channels.states,
    dismissConnectionFeedback: channels.feedback ? channels.dismiss : dismissConnectionFeedback,
    retryConnectionSync: channels.feedback ? channels.retry : retryConnectionSync,
    connectionError: channels.feedback ? channels.feedback.reason : state.connectionState !== 'connected' ? state.connectionError : undefined,
    runtimeError: channels.feedback ? activeModelError : state.connectionState === 'connected' ? activeModelError ?? state.connectionError : undefined,
    compactSession,
    createSession,
    deleteSession,
    renameSession,
    draftParticipantIDs,
    dismissQuestion,
    followupSubagent,
    getSubagentThreadDetails,
    isThinking,
    interruptSubagent,
    pendingPermissions,
    pendingQuestions,
    allPendingQuestions,
    permissionMode,
    respondPermission,
    reset: () => {
      scopeRef.current.epoch += 1;
      connectionFeedbackController.reset(scopeRef.current.enabled);
      activeSessionIdRef.current = undefined;
      cachedSessionIdsRef.current = [];
      sendingSessionIdsRef.current.clear();
      preparingSessionIdsRef.current.clear();
      hydratingSessionIdsRef.current.clear();
      deletedSessionIdsRef.current.clear();
      setDraftParticipantIDs(defaultParticipantID === undefined || defaultParticipantID === null ? [] : [defaultParticipantID]);
      setModelErrors({});
      dispatch(resetRuntime());
    },
    selectSession: chooseSession,
    sendMessage,
    sessions,
    updatePermissionMode,
    loadOlderMessages,
    updateSessionParticipants,
  };
}
