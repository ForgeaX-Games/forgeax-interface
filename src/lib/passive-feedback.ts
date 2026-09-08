export const PASSIVE_FEEDBACK_EVENT = 'forgeax:passive-feedback';
export const PASSIVE_FEEDBACK_RECOVERED_EVENT = 'forgeax:passive-feedback-recovered';

export type PassiveFeedbackPlacement = 'corner' | 'center' | 'chat';

export type PassiveFeedbackRecovery =
  | { kind: 'none' }
  | { kind: 'command'; commandId: string }
  | { kind: 'reload-page' };

/** Identifies the turn that produced a per-attempt passive feedback card. */
export interface PassiveFeedbackScope {
  sid?: string;
  agentId?: string;
}

export interface PassiveFeedbackSignal {
  code: string;
  message: string;
  source?: string;
  ts?: number;
  scope?: PassiveFeedbackScope;
}

export interface PassiveFeedbackIncident {
  exceptionKey: string;
  titleKey: string;
  actionKey: string;
  summary: string;
  stack?: string;
  placement: PassiveFeedbackPlacement;
  recovery: PassiveFeedbackRecovery;
  scope?: PassiveFeedbackScope;
}

export interface PassiveFeedbackResolution {
  exceptionKey: string;
  scope?: PassiveFeedbackScope;
}

interface IncidentPreset {
  exceptionKey: string;
  codes: readonly string[];
  titleKey: string;
  actionKey: string;
  placement: PassiveFeedbackPlacement;
  recovery: PassiveFeedbackRecovery;
  threshold?: number;
  withinMs?: number;
}

const PRESETS: readonly IncidentPreset[] = [
  {
    exceptionKey: 'save-failure',
    codes: ['save-serialization-failed', 'save-write-failed', 'save-pack-validation-failed'],
    titleKey: 'feedback.passive.incidents.save',
    actionKey: 'feedback.passive.actions.retrySave',
    placement: 'center',
    recovery: { kind: 'command', commandId: 'editor.save' },
  },
  {
    exceptionKey: 'play-failure',
    codes: ['play-assemble-failed', 'play-save-failed', 'play-bootstrap-failed'],
    titleKey: 'feedback.passive.incidents.play',
    actionKey: 'feedback.passive.actions.retryPlay',
    placement: 'center',
    recovery: { kind: 'command', commandId: 'editor.play' },
  },
  {
    exceptionKey: 'gpu-device-lost',
    codes: ['device-lost', 'context-lost', 'webgpu-init-failed'],
    titleKey: 'feedback.passive.incidents.gpu',
    actionKey: 'feedback.passive.actions.reloadPreview',
    placement: 'center',
    recovery: { kind: 'command', commandId: 'editor.restartPreview' },
  },
  {
    exceptionKey: 'renderer-crash',
    codes: [
      'renderer-process-terminated',
      'renderer-crash',
      'renderer-error',
      'renderer-not-ready',
      'renderer-provenance-unavailable',
      'app-system-update-failed',
    ],
    titleKey: 'feedback.passive.incidents.renderer',
    actionKey: 'feedback.passive.actions.restartRenderer',
    placement: 'center',
    recovery: { kind: 'command', commandId: 'editor.restartPreview' },
  },
  {
    exceptionKey: 'runtime-disconnected',
    codes: ['runtime-unavailable', 'runtime-disconnected', 'viewport-runtime-disconnected'],
    titleKey: 'feedback.passive.incidents.runtime',
    actionKey: 'feedback.passive.actions.reconnectRuntime',
    placement: 'center',
    recovery: { kind: 'command', commandId: 'editor.restartPreview' },
  },
  {
    exceptionKey: 'agent-unresponsive',
    codes: ['ui.stall', 'agent_crash', 'agent-crash'],
    titleKey: 'feedback.passive.incidents.agent',
    actionKey: 'feedback.passive.actions.reconnectAgent',
    placement: 'chat',
    recovery: { kind: 'command', commandId: 'session.reconnect' },
  },
  {
    exceptionKey: 'main-thread-stall',
    codes: ['main-thread-stall'],
    titleKey: 'feedback.passive.incidents.mainThread',
    actionKey: 'feedback.passive.actions.feedbackContinue',
    placement: 'corner',
    recovery: { kind: 'none' },
  },
  {
    exceptionKey: 'build-failures',
    codes: ['vite:error', 'build-failed', 'build-error'],
    titleKey: 'feedback.passive.incidents.build',
    actionKey: 'feedback.passive.actions.retryBuild',
    placement: 'corner',
    recovery: { kind: 'command', commandId: 'editor.restartPreview' },
    threshold: 3,
    withinMs: 30_000,
  },
  {
    exceptionKey: 'uncaught-errors',
    codes: ['window-error', 'unhandled-rejection'],
    titleKey: 'feedback.passive.incidents.uncaught',
    actionKey: 'feedback.passive.actions.reloadStudio',
    placement: 'corner',
    recovery: { kind: 'reload-page' },
    threshold: 3,
    withinMs: 10_000,
  },
];

function matchesPreset(preset: IncidentPreset, signal: PassiveFeedbackSignal): boolean {
  const code = signal.code.trim().toLowerCase();
  const message = signal.message.toLowerCase();
  if (preset.codes.some((candidate) => code === candidate || message.includes(candidate))) return true;

  // Production errors are structured families, not a closed list. Keep the
  // document's canonical codes above while accepting concrete owner variants.
  if (preset.exceptionKey === 'save-failure') {
    return /^save-[a-z0-9-]*(?:failed|failure)$/.test(code);
  }
  if (preset.exceptionKey === 'play-failure') {
    return /^play-[a-z0-9-]*failed$/.test(code);
  }
  if (preset.exceptionKey === 'renderer-crash') {
    return /^renderer-[a-z0-9-]*(?:failed|failure|error|crash|terminated|unavailable)$/.test(code);
  }
  if (preset.exceptionKey === 'runtime-disconnected') {
    return /^(?:viewport-)?runtime-[a-z0-9-]*(?:disconnected|unavailable|unreachable)$/.test(code);
  }
  if (preset.exceptionKey === 'build-failures') {
    return code === 'vag-console' && /^\[vite build\]/i.test(signal.message.trim());
  }
  return false;
}

function diagnosticParts(message: string): { summary: string; stack?: string } {
  const lines = message.split('\n').map((line) => line.trim()).filter(Boolean);
  const summary = lines[0] || message.trim() || 'Unknown failure';
  return lines.length > 1 ? { summary, stack: lines.join('\n') } : { summary };
}

export interface PassiveFeedbackClassifier {
  ingest(signal: PassiveFeedbackSignal): PassiveFeedbackIncident | null;
}

export function createPassiveFeedbackClassifier(): PassiveFeedbackClassifier {
  const occurrences = new Map<string, number[]>();
  return {
    ingest(signal) {
      const preset = PRESETS.find((candidate) => matchesPreset(candidate, signal));
      if (!preset) return null;

      const now = signal.ts ?? Date.now();
      const threshold = preset.threshold ?? 1;
      if (threshold > 1) {
        const since = now - (preset.withinMs ?? 10_000);
        const recent = [...(occurrences.get(preset.exceptionKey) ?? []), now]
          .filter((ts) => ts >= since);
        occurrences.set(preset.exceptionKey, recent);
        if (recent.length < threshold) return null;
        occurrences.set(preset.exceptionKey, []);
      }

      return {
        exceptionKey: preset.exceptionKey,
        titleKey: preset.titleKey,
        actionKey: preset.actionKey,
        placement: preset.placement,
        recovery: preset.recovery,
        ...(signal.scope ? { scope: { ...signal.scope } } : {}),
        ...diagnosticParts(signal.message),
      };
    },
  };
}

export function reportPassiveFeedbackSignal(signal: PassiveFeedbackSignal): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PassiveFeedbackSignal>(PASSIVE_FEEDBACK_EVENT, { detail: signal }));
}

/**
 * Resolves a previously reported incident without conflating two agents or
 * sessions that happen to share the same exception key. A missing resolution
 * scope intentionally means "all scopes" for callers that only have a global
 * recovery fact.
 */
export function matchesPassiveFeedbackScope(
  incidentScope: PassiveFeedbackScope | undefined,
  resolutionScope: PassiveFeedbackScope | undefined,
): boolean {
  if (!resolutionScope) return true;
  if (resolutionScope.sid !== undefined && resolutionScope.sid !== incidentScope?.sid) return false;
  if (resolutionScope.agentId !== undefined && resolutionScope.agentId !== incidentScope?.agentId) return false;
  return true;
}

export function reportPassiveFeedbackRecovery(resolution: PassiveFeedbackResolution): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PassiveFeedbackResolution>(PASSIVE_FEEDBACK_RECOVERED_EVENT, { detail: resolution }));
}
