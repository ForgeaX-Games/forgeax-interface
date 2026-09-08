export type ChatDockAnimationPhase =
  | 'idle'
  | 'collapsing'
  | 'preparing-expand'
  | 'expanding';

export const CHAT_DOCK_ANIMATION_FALLBACK_MS = 300;

interface ClosedChatOpenState {
  atHome: boolean;
  collapsed: boolean;
}

interface ClosedChatOpenActions {
  moveHome(): void;
  markForReopen(): void;
  prepareExpand(): void;
  uncollapse(): void;
}

/**
 * F1's closed → open path must commit the prepared zero-width phase before it
 * clears the collapsed store flag. Otherwise ChatDock renders one frame at its
 * full persisted width while the dockview panel is still absent.
 */
export function prepareClosedChatOpen(
  state: ClosedChatOpenState,
  actions: ClosedChatOpenActions,
): void {
  if (!state.atHome) actions.moveHome();
  actions.markForReopen();
  actions.prepareExpand();
  if (state.collapsed) actions.uncollapse();
}

interface TimerScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface ChatDockAnimationCallbacks {
  onPhaseChange(phase: ChatDockAnimationPhase): void;
  shouldFinishCollapse(): boolean;
  onCollapse(): void;
}

export interface ChatDockAnimationController {
  getPhase(): ChatDockAnimationPhase;
  activate(): void;
  collapse(): void;
  prepareExpand(): void;
  startExpand(): void;
  transitionEnd(): void;
  cancel(): void;
  dispose(): void;
}

const browserScheduler: TimerScheduler = {
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

/**
 * Owns the cancellable part of the ChatDock width transition. DOM preparation
 * stays in DockRegion (it must run after React commits), while this controller
 * guarantees that a stale transitionend/fallback can never close a panel that
 * has already been expanded again.
 */
export function createChatDockAnimationController(
  callbacks: ChatDockAnimationCallbacks,
  scheduler: TimerScheduler = browserScheduler,
  fallbackMs = CHAT_DOCK_ANIMATION_FALLBACK_MS,
): ChatDockAnimationController {
  let phase: ChatDockAnimationPhase = 'idle';
  let fallback: unknown | null = null;
  let disposed = false;

  const clearFallback = (): void => {
    if (fallback === null) return;
    scheduler.clearTimeout(fallback);
    fallback = null;
  };

  const publish = (next: ChatDockAnimationPhase): void => {
    phase = next;
    if (!disposed) callbacks.onPhaseChange(next);
  };

  const settleCollapse = (): void => {
    if (disposed || phase !== 'collapsing') return;
    clearFallback();
    if (callbacks.shouldFinishCollapse()) callbacks.onCollapse();
    publish('idle');
  };

  const settleExpand = (): void => {
    if (disposed || phase !== 'expanding') return;
    clearFallback();
    publish('idle');
  };

  const schedule = (settle: () => void): void => {
    clearFallback();
    fallback = scheduler.setTimeout(settle, fallbackMs);
  };

  return {
    getPhase: () => phase,
    activate: () => {
      disposed = false;
    },
    collapse: () => {
      if (disposed) return;
      clearFallback();
      publish('collapsing');
      schedule(settleCollapse);
    },
    prepareExpand: () => {
      if (disposed) return;
      clearFallback();
      publish('preparing-expand');
    },
    startExpand: () => {
      if (disposed) return;
      clearFallback();
      publish('expanding');
      schedule(settleExpand);
    },
    transitionEnd: () => {
      if (phase === 'collapsing') settleCollapse();
      else if (phase === 'expanding') settleExpand();
    },
    cancel: () => {
      if (disposed) return;
      clearFallback();
      publish('idle');
    },
    dispose: () => {
      clearFallback();
      disposed = true;
      phase = 'idle';
    },
  };
}
