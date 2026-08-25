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

interface UseSessionRuntimeOptions {
  onEvent?: (event: ApiEvent) => void;
  defaultParticipantID?: number | string;
}

export function useSessionRuntime(enabled = true, options: UseSessionRuntimeOptions = {}) {
  const [state, dispatch] = useReducer(runtimeReducer, initialRuntimeState);
  const [permissionMode, setPermissionModeState] = useState<PermissionMode>('restricted');
  const [draftParticipantIDs, setDraftParticipantIDs] = useState<Array<number | string>>([]);
  const activeSessionIdRef = useRef<string | undefined>(state.activeSessionId);
  const hasOpenedStreamRef = useRef(false);
  const eventErrorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sendingSessionIdsRef = useRef(new Set<string>());
  const hydratingSessionIdsRef = useRef(new Set<string>());
  const onEventRef = useRef(options.onEvent);
  const defaultParticipantID = options.defaultParticipantID;

  const isRuntimeReady = useCallback(() => enabled, [enabled]);

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
    if (enabled) return;
    hasOpenedStreamRef.current = false;
    dispatch(resetRuntime());
  }, [enabled]);

  const refreshSessions = useCallback(async () => {
    if (!isRuntimeReady()) return [];
    const sessions = await listSessionsRaw();
    dispatch(hydrateSessionList(sessions));
    return sessions;
  }, [isRuntimeReady]);

  const refreshSessionMessages = useCallback(async (sessionID?: string) => {
    if (!sessionID || !isRuntimeReady()) return;
    const page = await listMessagesRaw(sessionID);
    dispatch(hydrateSessionMessages(sessionID, page));
  }, [isRuntimeReady]);

  const refreshBlockers = useCallback(async () => {
    if (!isRuntimeReady()) return;
    const [permissions, questions, permissionModeResponse, screenCaptureRequests, cameraCaptureRequests] = await Promise.all([
      listPermissionsRaw(),
      listQuestionsRaw(),
      getPermissionMode(),
      listScreenCaptureRequests(),
      listCameraCaptureRequests(),
    ]);
    dispatch(hydratePendingPermissions(permissions));
    dispatch(hydratePendingQuestions(questions));
    setPermissionModeState(permissionModeResponse.mode);
    for (const request of screenCaptureRequests) void handleScreenCaptureRequest(request);
    for (const request of cameraCaptureRequests) void handleCameraCaptureRequest(request);
  }, [isRuntimeReady]);

  useEffect(() => {
    if (!isRuntimeReady()) return;
    let cancelled = false;

    async function load() {
      try {
        const sessions = await refreshSessions();
        if (cancelled) return;
        const firstSessionID = activeSessionIdRef.current ?? sessions[0]?.id;
        if (firstSessionID) {
          await getRuntimeModelConfig(firstSessionID);
          await refreshSessionMessages(firstSessionID);
        }
        await refreshBlockers();
      } catch (error) {
        if (cancelled) return;
        dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isRuntimeReady, refreshBlockers, refreshSessionMessages, refreshSessions]);

  const activeSessionHydrated = state.activeSessionId
    ? Boolean(state.sessions[state.activeSessionId]?.hydrated)
    : false;

  useEffect(() => {
    if (!isRuntimeReady()) return;
    const sessionID = state.activeSessionId;
    if (!sessionID) return;
    if (activeSessionHydrated || hydratingSessionIdsRef.current.has(sessionID)) return;

    let cancelled = false;
    hydratingSessionIdsRef.current.add(sessionID);

    async function hydrate() {
      try {
        const page = await listMessagesRaw(sessionID);
        if (cancelled) return;
        dispatch(hydrateSessionMessages(sessionID, page));
      } catch (error) {
        if (cancelled) return;
        dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      } finally {
        hydratingSessionIdsRef.current.delete(sessionID);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [activeSessionHydrated, isRuntimeReady, state.activeSessionId]);

  useEffect(() => {
    if (!isRuntimeReady()) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void subscribeEvents({
      onOpen: () => {
        if (eventErrorTimerRef.current) {
          clearTimeout(eventErrorTimerRef.current);
          eventErrorTimerRef.current = undefined;
        }
        dispatch(setConnectionState('connected'));
        dispatch(setConnectionError(undefined));
        const sessionID = activeSessionIdRef.current;
        const reconcile = async () => {
          if (!isRuntimeReady()) return;
          try {
            await Promise.all([refreshSessions(), refreshBlockers()]);
            if (sessionID) {
              await getRuntimeModelConfig(sessionID);
              await refreshSessionMessages(sessionID);
            }
          } catch (error) {
            dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
          }
        };

        if (!hasOpenedStreamRef.current) {
          hasOpenedStreamRef.current = true;
          return;
        }

        void reconcile();
      },
      onError: (error) => {
        dispatch(setConnectionState('disconnected'));
        if (eventErrorTimerRef.current) {
          clearTimeout(eventErrorTimerRef.current);
        }
        eventErrorTimerRef.current = setTimeout(() => {
          eventErrorTimerRef.current = undefined;
          dispatch(setConnectionError(error));
        }, 2000);
      },
      onEvent: (event) => {
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
      },
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        cleanup = dispose;
      })
      .catch((error) => {
        dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      });

    return () => {
      disposed = true;
      if (eventErrorTimerRef.current) {
        clearTimeout(eventErrorTimerRef.current);
        eventErrorTimerRef.current = undefined;
      }
      cleanup?.();
    };
  }, [isRuntimeReady, refreshBlockers, refreshSessionMessages, refreshSessions]);

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
          await sendPromptAsync(session.id, content, attachments);
          dispatch(acceptLocalUserMessage(session.id, optimisticMessage.messageID));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendingSessionIdsRef.current.delete(session.id);
          dispatch(failLocalUserMessage(session.id, optimisticMessage.messageID, message));
          dispatch(setConnectionError(message));
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
          await followUpTurn(sessionID, content);
          dispatch(acceptLocalUserMessage(sessionID, optimisticMessage.messageID));
        } catch (error) {
          dispatch(failLocalUserMessage(
            sessionID,
            optimisticMessage.messageID,
            error instanceof Error ? error.message : String(error),
            { followUp: true },
          ));
          throw error;
        }
        return;
      }

      sendingSessionIdsRef.current.add(sessionID);
      const optimisticMessage = pushLocalUserMessage(sessionID, content, attachments);
      dispatch(optimisticMessage);
      try {
        await sendPromptAsync(sessionID, content, attachments);
        dispatch(acceptLocalUserMessage(sessionID, optimisticMessage.messageID));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendingSessionIdsRef.current.delete(sessionID);
        dispatch(failLocalUserMessage(sessionID, optimisticMessage.messageID, message));
        dispatch(setConnectionError(message));
        throw error;
      }
    },
    [draftParticipantIDs, isRuntimeReady],
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
      dispatch(setSessionStatus(sessionID, 'idle'));
      dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
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
        dispatch(setSessionStatus(sessionID, 'idle'));
        sendingSessionIdsRef.current.delete(sessionID);
      }
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
    return session;
  }, [isRuntimeReady]);

  const deleteSession = useCallback(async (sessionID: string) => {
    if (!isRuntimeReady()) throw new Error('Eden Agent runtime is not authenticated');
    if (sendingSessionIdsRef.current.has(sessionID)) {
      throw new Error('智能体正在处理当前任务，请先停止任务再删除会话。');
    }
    await deleteSessionRaw(sessionID);
    const nextSessionID = state.sessionOrder.find((id) => id !== sessionID);
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

  const answerQuestion = useCallback(async (requestID: string, answers: string[][]) => {
    await replyQuestion(requestID, answers);
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

  return {
    activeSession,
    activeSessionId: state.activeSessionId ?? '',
    activeSessionError,
    abortSession,
    answerQuestion,
    connectionState: state.connectionState,
    connectionError: state.connectionError,
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
      activeSessionIdRef.current = undefined;
      setDraftParticipantIDs(defaultParticipantID === undefined || defaultParticipantID === null ? [] : [defaultParticipantID]);
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
