import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  abortSession as abortSessionRaw,
  compactSession as compactSessionRaw,
  createSessionRaw,
  getPermissionMode,
  getSubagentThreadDetails as getSubagentThreadDetailsRaw,
  followupSubagent as followupSubagentRaw,
  interruptSubagent as interruptSubagentRaw,
  listPermissionsRaw,
  listQuestionsRaw,
  listScreenCaptureRequests,
  listMessagesRaw,
  listSessionsRaw,
  rejectQuestion,
  replyPermission,
  replyQuestion,
  sendPromptAsync,
  setPermissionMode as setPermissionModeRaw,
  updateSessionParticipants as updateSessionParticipantsRaw,
  subscribeEvents,
} from '../lib/mon_agent_api';
import type { ApiEvent, PendingScreenCapture } from '../lib/mon_agent_api';
import { getStoredToken } from '../lib/auth';
import {
  applyRuntimeEvent,
  hydratePendingPermissions,
  hydratePendingQuestions,
  hydrateSessionList,
  hydrateSessionMessages,
  initialRuntimeState,
  resetRuntime,
  runtimeReducer,
  setActiveSession,
  setConnectionState,
  setConnectionError,
} from '../lib/session-reducer';
import { selectActiveSession, selectPendingPermissions, selectPendingQuestions, selectSessions, selectSessionStatus } from '../lib/session-selectors';
import type { PermissionMode, PromptAttachment } from '../types';
import { handleScreenCaptureRequest } from '../lib/screen-capture';

interface UseSessionRuntimeOptions {
  onEvent?: (event: ApiEvent) => void;
}

export function useSessionRuntime(enabled = true, options: UseSessionRuntimeOptions = {}) {
  const [state, dispatch] = useReducer(runtimeReducer, initialRuntimeState);
  const [permissionMode, setPermissionModeState] = useState<PermissionMode>('full_access');
  const activeSessionIdRef = useRef<string | undefined>(state.activeSessionId);
  const hasOpenedStreamRef = useRef(false);
  const eventErrorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sendingSessionIdsRef = useRef(new Set<string>());
  const onEventRef = useRef(options.onEvent);

  const isRuntimeReady = useCallback(() => enabled && Boolean(getStoredToken()), [enabled]);

  useEffect(() => {
    activeSessionIdRef.current = state.activeSessionId;
  }, [state.activeSessionId]);

  useEffect(() => {
    onEventRef.current = options.onEvent;
  }, [options.onEvent]);

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
    const messages = await listMessagesRaw(sessionID);
    dispatch(hydrateSessionMessages(sessionID, messages));
  }, [isRuntimeReady]);

  const refreshBlockers = useCallback(async () => {
    if (!isRuntimeReady()) return;
    const [permissions, questions, permissionModeResponse, screenCaptureRequests] = await Promise.all([
      listPermissionsRaw(),
      listQuestionsRaw(),
      getPermissionMode(),
      listScreenCaptureRequests(),
    ]);
    dispatch(hydratePendingPermissions(permissions));
    dispatch(hydratePendingQuestions(questions));
    setPermissionModeState(permissionModeResponse.mode);
    for (const request of screenCaptureRequests) void handleScreenCaptureRequest(request);
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

  useEffect(() => {
    if (!isRuntimeReady()) return;
    const sessionID = state.activeSessionId;
    if (!sessionID) return;
    const session = state.sessions[sessionID];
    if (session?.hydrated) return;

    let cancelled = false;

    async function hydrate() {
      try {
        const messages = await listMessagesRaw(sessionID);
        if (cancelled) return;
        dispatch(hydrateSessionMessages(sessionID, messages));
      } catch (error) {
        if (cancelled) return;
        dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [isRuntimeReady, state.activeSessionId, state.sessions]);

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
        if (event.type === 'permission.mode') {
          const nextPermissionMode = event.properties.mode;
          if (nextPermissionMode === 'ask' || nextPermissionMode === 'full_access') {
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
    if (!isRuntimeReady()) throw new Error('MonAgent runtime is not authenticated');
    try {
      const session = await createSessionRaw();
      activeSessionIdRef.current = session.id;
      dispatch(hydrateSessionList([session]));
      dispatch(setActiveSession(session.id));
      return session;
    } catch (error) {
      dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }, [isRuntimeReady]);

  const chooseSession = useCallback((sessionID?: string) => {
    activeSessionIdRef.current = sessionID;
    dispatch(setActiveSession(sessionID));
  }, []);

  const sendMessage = useCallback(
    async (content: string, attachments: PromptAttachment[]) => {
      let sessionID = activeSessionIdRef.current;
      if (!isRuntimeReady()) {
        throw new Error('MonAgent runtime is not authenticated');
      }
      if (!sessionID) {
        const session = await createSession();
        sessionID = session.id;
      }
      if (!sessionID) {
        throw new Error('No active session');
      }
      if (sendingSessionIdsRef.current.has(sessionID)) {
        return;
      }

      sendingSessionIdsRef.current.add(sessionID);
      dispatch(setConnectionError(undefined));
      try {
        await sendPromptAsync(sessionID, content, attachments);
      } catch (error) {
        sendingSessionIdsRef.current.delete(sessionID);
        dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
        throw error;
      }
    },
    [createSession, isRuntimeReady, state.activeSessionId],
  );

  const compactSession = useCallback(async (instructions?: string) => {
    const sessionID = activeSessionIdRef.current;
    if (!isRuntimeReady()) {
      throw new Error('MonAgent runtime is not authenticated');
    }
    if (!sessionID) {
      throw new Error('当前没有可压缩的会话。');
    }
    if (sendingSessionIdsRef.current.has(sessionID)) {
      throw new Error('智能体正在处理当前任务，请稍后再压缩。');
    }

    sendingSessionIdsRef.current.add(sessionID);
    dispatch(setConnectionError(undefined));
    try {
      await compactSessionRaw(sessionID, instructions);
    } catch (error) {
      sendingSessionIdsRef.current.delete(sessionID);
      dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }, [isRuntimeReady]);

  const abortSession = useCallback(async () => {
    const sessionID = activeSessionIdRef.current;
    if (!isRuntimeReady()) {
      throw new Error('MonAgent runtime is not authenticated');
    }
    if (!sessionID) {
      throw new Error('当前没有可中止的会话。');
    }

    dispatch(setConnectionError(undefined));
    try {
      return await abortSessionRaw(sessionID);
    } catch (error) {
      dispatch(setConnectionError(error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }, [isRuntimeReady]);

  const updateSessionParticipants = useCallback(async (assistantIDs: Array<number | string>) => {
    const sessionID = activeSessionIdRef.current;
    if (!sessionID || !isRuntimeReady()) throw new Error('当前没有可更新的会话。');
    const session = await updateSessionParticipantsRaw(sessionID, assistantIDs);
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
    dismissQuestion,
    followupSubagent,
    getSubagentThreadDetails,
    isThinking,
    interruptSubagent,
    pendingPermissions,
    pendingQuestions,
    permissionMode,
    respondPermission,
    reset: () => dispatch(resetRuntime()),
    selectSession: chooseSession,
    sendMessage,
    sessions,
    updatePermissionMode,
    updateSessionParticipants,
  };
}
