const WINDOW_SIZES = {
  login: {
    width: 960,
    height: 540,
  },
  chatWithCharacter: {
    width: 960,
    height: 540,
  },
  character: {
    aspectRatio: 7 / 16,
    heightRatio: 0.5,
  },
} as const;

export type DesktopWindowMode = keyof typeof WINDOW_SIZES;
export type DesktopViewMode = 'chatWithCharacter' | 'character';
export type PetDock = 'left' | 'center' | 'right';
export type PetInputMode = 'compact' | 'panel' | 'hidden';
export type PetTTSMode = 'none' | 'text_only' | 'all';
export type PetIconAnchor = 'top-left' | 'top-right' | 'side-left' | 'side-right';
export type PetIconEdge = 'none' | 'left' | 'right' | 'top' | 'bottom';
export interface PetIconPlacement {
  anchor: PetIconAnchor;
  edge: PetIconEdge;
}
export interface PetCharacterViewport {
  mode: 'window' | 'work-area';
  x: number;
  y: number;
  width: number;
  height: number;
}
export const DEFAULT_PET_ICON_PLACEMENT: PetIconPlacement = {
  anchor: 'top-left',
  edge: 'none',
};
export const DEFAULT_PET_CHARACTER_VIEWPORT: PetCharacterViewport = {
  mode: 'window',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};
export const MIN_PET_CHARACTER_HEIGHT = 120;
export const MIN_PET_VISIBLE_SIZE = 64;

export function clampDesktopPetPosition(
  position: { x: number; y: number },
  petSize: { width: number; height: number },
  workArea: { x: number; y: number; width: number; height: number },
) {
  const visibleWidth = Math.min(MIN_PET_VISIBLE_SIZE, workArea.width, petSize.width);
  const visibleHeight = Math.min(MIN_PET_VISIBLE_SIZE, workArea.height, petSize.height);
  return {
    x: Math.min(
      Math.max(position.x, workArea.x - petSize.width + visibleWidth),
      workArea.x + workArea.width - visibleWidth,
    ),
    y: Math.min(
      Math.max(position.y, workArea.y - petSize.height + visibleHeight),
      workArea.y + workArea.height - visibleHeight,
    ),
  };
}

export interface PetSettings {
  alwaysOnTop: boolean;
  transparentWindow: boolean;
  clickThrough: boolean;
  characterDraggable: boolean;
  showInput: boolean;
  voiceInputEnabled: boolean;
  ttsMode: PetTTSMode;
  petScale: number;
  inputOpacity: number;
  dock: PetDock;
  inputMode: PetInputMode;
  inputWidth: number;
  inputHeight: number;
  inputFontScale: number;
  windowX: number | null;
  windowY: number | null;
}

export interface DesktopEnvironmentPreview {
  desktop: string;
  wallpaper: {
    filePath: string;
    mode: string;
    primaryColor: string;
  };
  panel: {
    id: number;
    position: 'top' | 'bottom' | 'left' | 'right';
    height: number;
    autoHide: boolean;
    applets: string[];
  } | null;
  workArea: { x: number; y: number; width: number; height: number };
  displayBounds: { x: number; y: number; width: number; height: number };
}

export interface DesktopScreenCapture {
  dataUrl: string;
  mime: 'image/png';
  width: number;
  height: number;
  displayId: string;
  sourceName?: string;
  source: 'desktop' | 'game';
}

export type DesktopScreenCaptureSource = 'auto' | 'desktop' | 'game';

export interface DesktopActivityFacts {
  surface?: string;
  chat_input_focused?: boolean;
  voice_recording?: boolean;
  tts_playing?: boolean;
  last_user_interaction_at?: string;
}

export interface DesktopPetPointerInput {
  phase: 'down' | 'move' | 'up' | 'cancel';
  pointerId: number;
  button: number;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  time: number;
}

export function reportPerformanceDiagnostic(kind: string, metrics: Record<string, unknown>) {
  const bridge = getDesktopBridge()
  if (!bridge) return Promise.resolve(false)
  return bridge.invoke<boolean>('report_performance_diagnostic', { kind, metrics }).catch(() => false)
}

export const DEFAULT_PET_SETTINGS: PetSettings = {
  alwaysOnTop: true,
  transparentWindow: true,
  clickThrough: false,
  characterDraggable: false,
  showInput: true,
  voiceInputEnabled: true,
  ttsMode: 'none',
  petScale: 100,
  inputOpacity: 78,
  dock: 'center',
  inputMode: 'compact',
  inputWidth: 78,
  inputHeight: 20,
  inputFontScale: 100,
  windowX: null,
  windowY: null,
};

function getDesktopBridge() {
  return window.monAgentDesktop;
}

export async function resizeDesktopWindow(mode: DesktopWindowMode) {
  const bridge = getDesktopBridge();
  if (!bridge) return;

  try {
    await bridge.invoke('set_window_size', {
      request: {
        ...WINDOW_SIZES[mode],
        mode,
        center: true,
      },
    });
  } catch {
    // Normal browser tabs cannot resize their outer window; ignore that path.
  }
}

export async function selectDesktopSkillDirectory() {
  const bridge = getDesktopBridge()
  if (!bridge) return null
  return bridge.invoke<string | null>("select_skill_directory")
}

export async function selectDesktopWorkspaceDirectory(path?: string) {
  const bridge = getDesktopBridge()
  if (!bridge) return null
  return bridge.invoke<string | null>("select_workspace_directory", { path })
}

export async function openDesktopWorkspaceDirectory(path: string) {
  const bridge = getDesktopBridge()
  if (!bridge) return false
  return bridge.invoke<boolean>("open_workspace_directory", { path })
}

export async function setDesktopWindowAppearance(mode: DesktopWindowMode) {
  const bridge = getDesktopBridge();
  if (!bridge) return;

  try {
    await bridge.invoke('set_window_appearance', { mode });
  } catch {
    // Normal browser tabs cannot change their outer window appearance.
  }
}

export async function setDesktopQuestionWindowVisible(visible: boolean) {
  const bridge = getDesktopBridge()
  if (!bridge) return false
  return bridge.invoke<boolean>('set_question_window_visible', { visible }).catch(() => false)
}

export async function setDesktopViewModeState(mode: DesktopViewMode) {
  const bridge = getDesktopBridge();
  if (!bridge) return;

  try {
    await bridge.invoke('set_view_mode_state', { mode });
  } catch {
    // Browser dev mode has no tray menu to update.
  }
}

export async function startDesktopWindowDrag() {
  const bridge = getDesktopBridge();
  if (!bridge) return;

  try {
    await bridge.invoke('start_window_drag');
  } catch {
    // Browser dev mode and unsupported platforms cannot drag the outer window.
  }
}

export async function closeDesktopWindow() {
  const bridge = getDesktopBridge();
  if (!bridge) return;

  try {
    await bridge.invoke('close_current_window');
  } catch {
    window.close();
  }
}

export async function minimizeDesktopWindow() {
  const bridge = getDesktopBridge();
  if (!bridge) return;

  try {
    await bridge.invoke('minimize_current_window');
  } catch {
    // Browser preview mode has no outer desktop window.
  }
}

export async function toggleMaximizeDesktopWindow() {
  const bridge = getDesktopBridge();
  if (!bridge) return;

  try {
    await bridge.invoke('toggle_maximize_current_window');
  } catch {
    // Browser preview mode has no outer desktop window.
  }
}

export async function openDesktopPetWindow() {
  const bridge = getDesktopBridge();
  if (!bridge) return false;

  try {
    await bridge.invoke('open_pet_window');
    return true;
  } catch {
    return false;
  }
}

export async function getDesktopPetSettings() {
  const bridge = getDesktopBridge();
  if (!bridge) return DEFAULT_PET_SETTINGS;

  try {
    return { ...DEFAULT_PET_SETTINGS, ...(await bridge.invoke<Partial<PetSettings>>('get_pet_settings')) };
  } catch {
    return DEFAULT_PET_SETTINGS;
  }
}

export async function applyDesktopPetSettings(settings: PetSettings) {
  const bridge = getDesktopBridge();
  if (!bridge) return settings;

  try {
    return { ...settings, ...(await bridge.invoke<Partial<PetSettings>>('apply_pet_settings', { settings })) };
  } catch {
    return settings;
  }
}

export async function previewDesktopPetSettings(settings: Partial<PetSettings>) {
  const bridge = getDesktopBridge()
  if (!bridge) return settings

  try {
    return await bridge.invoke<Partial<PetSettings>>('preview_pet_settings', { settings })
  } catch {
    return settings
  }
}

export async function setDesktopPetBubbleCollapsed(collapsed: boolean) {
  const bridge = getDesktopBridge();
  if (!bridge) return;

  try {
    await bridge.invoke('set_pet_bubble_collapsed', { collapsed });
  } catch {
    // Browser preview mode has no independent desktop-pet bubble window.
  }
}

export async function setDesktopPetBubbleKeyboardFocus(enabled: boolean) {
  const bridge = getDesktopBridge();
  if (!bridge) return true;

  try {
    return Boolean(await bridge.invoke<boolean>('set_pet_bubble_keyboard_focus', { enabled }));
  } catch {
    return false;
  }
}

export type DesktopSpeechSurface = 'main-chat' | 'pet-bubble';
export type DesktopSpeechIntent = 'auto' | 'manual';

export interface DesktopSpeechPlaybackClaim {
  granted: boolean;
  leaseId?: string;
  reason?: string;
}

export interface DesktopSpeechPlaybackControl {
  type: 'stop';
  leaseId: string;
  reason?: string;
  replacementIntent?: DesktopSpeechIntent;
  replacementSurface?: DesktopSpeechSurface;
}

export type DesktopSpeechPlaybackOutcome = 'completed' | 'interrupted';

export async function getDesktopPetBubbleCollapsed() {
  const bridge = getDesktopBridge();
  if (!bridge) return false;

  try {
    return Boolean(await bridge.invoke<boolean>('get_pet_bubble_collapsed'));
  } catch {
    return false;
  }
}

export async function getDesktopEnvironmentPreview() {
  const bridge = getDesktopBridge();
  if (!bridge) return null;

  try {
    return await bridge.invoke<DesktopEnvironmentPreview>('get_desktop_environment');
  } catch {
    return null;
  }
}

export async function captureDesktopScreen(source: DesktopScreenCaptureSource = 'auto') {
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error('当前不是 MonAgent 桌面客户端，无法截取屏幕');
  return await bridge.invoke<DesktopScreenCapture>('capture_screen', { source });
}

export async function updateDesktopActivityFacts(facts: DesktopActivityFacts) {
  const bridge = getDesktopBridge();
  if (!bridge) return false;
  try {
    return await bridge.invoke<boolean>('update_activity_facts', { facts });
  } catch {
    return false;
  }
}

export function resolveDesktopFileUrl(filePath?: string | null) {
  if (!filePath) return '';
  const bridge = getDesktopBridge();
  return bridge?.convertFileSrc?.(filePath) ?? filePath;
}

export async function listenDesktopViewMode(onMode: (mode: DesktopViewMode) => void) {
  const bridge = getDesktopBridge();
  if (!bridge?.onViewMode) return undefined;

  try {
    return bridge.onViewMode((mode) => {
      if (mode === 'character' || mode === 'chatWithCharacter') {
        onMode(mode);
      }
    });
  } catch {
    return undefined;
  }
}

export async function listenDesktopPetSettings(onSettings: (settings: PetSettings) => void) {
  const bridge = getDesktopBridge();
  if (!bridge?.onPetSettings) return undefined;

  try {
    return bridge.onPetSettings((settings) => {
      onSettings({ ...DEFAULT_PET_SETTINGS, ...settings });
    });
  } catch {
    return undefined;
  }
}

export async function claimDesktopSpeechPlayback(
  surface: DesktopSpeechSurface,
  segmentId: string,
  intent: DesktopSpeechIntent,
): Promise<DesktopSpeechPlaybackClaim> {
  const bridge = getDesktopBridge();
  if (!bridge) return { granted: true, leaseId: `browser:${surface}:${segmentId}` };
  try {
    return await bridge.invoke<DesktopSpeechPlaybackClaim>('claim_speech_playback', {
      surface,
      segmentId,
      intent,
    });
  } catch {
    return { granted: false, reason: 'desktop-coordinator-unavailable' };
  }
}

export async function authorizeAutomaticSpeechSynthesis(surface: DesktopSpeechSurface) {
  const bridge = getDesktopBridge();
  if (!bridge) return true;
  try {
    return Boolean(await bridge.invoke<boolean>('authorize_automatic_speech_synthesis', { surface }));
  } catch {
    return false;
  }
}

export async function releaseDesktopSpeechPlayback(
  leaseId?: string | null,
  outcome: DesktopSpeechPlaybackOutcome = 'interrupted',
) {
  const bridge = getDesktopBridge();
  if (!bridge || !leaseId || leaseId.startsWith('browser:')) return false;
  try {
    return await bridge.invoke<boolean>('release_speech_playback', { leaseId, outcome });
  } catch {
    return false;
  }
}

export function reportSpeechDiagnostic(event: string, details: Record<string, unknown> = {}) {
  const bridge = getDesktopBridge()
  if (!bridge) return Promise.resolve(false)
  return bridge.invoke<boolean>('report_speech_diagnostic', { event, details }).catch(() => false)
}

export async function listenDesktopSpeechPlaybackControl(
  onControl: (control: DesktopSpeechPlaybackControl) => void,
) {
  const bridge = getDesktopBridge();
  if (!bridge?.onSpeechPlaybackControl) return undefined;
  try {
    return bridge.onSpeechPlaybackControl(onControl);
  } catch {
    return undefined;
  }
}

export async function listenDesktopPetBubbleCollapsed(onCollapsed: (collapsed: boolean) => void) {
  const bridge = getDesktopBridge();
  if (!bridge?.onPetBubbleCollapsed) return undefined;

  try {
    return bridge.onPetBubbleCollapsed((collapsed) => onCollapsed(Boolean(collapsed)));
  } catch {
    return undefined;
  }
}

export async function listenDesktopGlobalPetPointer(onPointer: (pointer: DesktopPetPointerInput) => void) {
  const bridge = getDesktopBridge();
  if (!bridge?.onGlobalPetPointer) return undefined;

  try {
    return bridge.onGlobalPetPointer((pointer) => {
      if (!pointer || !['down', 'move', 'up', 'cancel'].includes(pointer.phase)) return;
      onPointer(pointer);
    });
  } catch {
    return undefined;
  }
}

function normalizePetIconPlacement(placement?: Partial<PetIconPlacement> | null): PetIconPlacement {
  const anchors: PetIconAnchor[] = ['top-left', 'top-right', 'side-left', 'side-right'];
  const edges: PetIconEdge[] = ['none', 'left', 'right', 'top', 'bottom'];
  return {
    anchor: anchors.includes(placement?.anchor as PetIconAnchor)
      ? placement!.anchor as PetIconAnchor
      : DEFAULT_PET_ICON_PLACEMENT.anchor,
    edge: edges.includes(placement?.edge as PetIconEdge)
      ? placement!.edge as PetIconEdge
      : DEFAULT_PET_ICON_PLACEMENT.edge,
  };
}

function normalizePetCharacterViewport(
  viewport?: Partial<PetCharacterViewport> | null,
): PetCharacterViewport {
  const x = Number(viewport?.x)
  const y = Number(viewport?.y)
  const width = Number(viewport?.width)
  const height = Number(viewport?.height)
  return {
    mode: viewport?.mode === 'work-area' ? 'work-area' : 'window',
    x: Number.isFinite(x) ? Math.round(x) : 0,
    y: Number.isFinite(y) ? Math.round(y) : 0,
    width: Number.isFinite(width) ? Math.max(1, Math.round(width)) : 1,
    height: Number.isFinite(height) ? Math.max(1, Math.round(height)) : 1,
  }
}

export async function getDesktopPetCharacterViewport() {
  const bridge = getDesktopBridge()
  if (!bridge) return DEFAULT_PET_CHARACTER_VIEWPORT
  try {
    return normalizePetCharacterViewport(
      await bridge.invoke<Partial<PetCharacterViewport>>('get_pet_character_viewport'),
    )
  } catch {
    return DEFAULT_PET_CHARACTER_VIEWPORT
  }
}

export async function listenDesktopPetCharacterViewport(
  onViewport: (viewport: PetCharacterViewport) => void,
) {
  const bridge = getDesktopBridge()
  if (!bridge?.onPetCharacterViewport) return undefined
  try {
    return bridge.onPetCharacterViewport((viewport) => {
      onViewport(normalizePetCharacterViewport(viewport))
    })
  } catch {
    return undefined
  }
}

export async function getDesktopPetIconPlacement() {
  const bridge = getDesktopBridge();
  if (!bridge) return DEFAULT_PET_ICON_PLACEMENT;
  try {
    return normalizePetIconPlacement(await bridge.invoke<Partial<PetIconPlacement>>('get_pet_icon_placement'));
  } catch {
    return DEFAULT_PET_ICON_PLACEMENT;
  }
}

export async function listenDesktopPetIconPlacement(onPlacement: (placement: PetIconPlacement) => void) {
  const bridge = getDesktopBridge();
  if (!bridge?.onPetIconPlacement) return undefined;
  try {
    return bridge.onPetIconPlacement((placement) => onPlacement(normalizePetIconPlacement(placement)));
  } catch {
    return undefined;
  }
}

export async function beginDesktopPetGroupDrag(screenX: number, screenY: number) {
  const bridge = getDesktopBridge();
  if (!bridge) return false;
  try {
    return Boolean(await bridge.invoke<boolean>('begin_pet_group_drag', { screenX, screenY }));
  } catch {
    return false;
  }
}

export async function updateDesktopPetGroupDrag(screenX: number, screenY: number) {
  const bridge = getDesktopBridge();
  if (!bridge) return false;
  try {
    return Boolean(await bridge.invoke<boolean>('update_pet_group_drag', { screenX, screenY }));
  } catch {
    return false;
  }
}

export async function endDesktopPetGroupDrag(screenX: number, screenY: number) {
  const bridge = getDesktopBridge();
  if (!bridge) return false;
  try {
    return Boolean(await bridge.invoke<boolean>('end_pet_group_drag', { screenX, screenY }));
  } catch {
    return false;
  }
}

export async function listenDesktopEnvironment(onEnvironment: (environment: DesktopEnvironmentPreview) => void) {
  const bridge = getDesktopBridge();
  if (!bridge?.onDesktopEnvironment) return undefined;

  try {
    return bridge.onDesktopEnvironment((environment) => {
      onEnvironment(environment as unknown as DesktopEnvironmentPreview);
    });
  } catch {
    return undefined;
  }
}

export async function listenDesktopOpenSettings(onOpen: () => void) {
  const bridge = getDesktopBridge();
  if (!bridge?.onOpenSettings) return undefined;

  try {
    return bridge.onOpenSettings(onOpen);
  } catch {
    return undefined;
  }
}
