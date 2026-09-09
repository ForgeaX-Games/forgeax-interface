import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useHost } from '../../core/app-shell';
import { useShellStore } from '../../store';
import {
  PASSIVE_FEEDBACK_EVENT,
  PASSIVE_FEEDBACK_RECOVERED_EVENT,
  createPassiveFeedbackClassifier,
  matchesPassiveFeedbackScope,
  reportPassiveFeedbackSignal,
  type PassiveFeedbackIncident,
  type PassiveFeedbackResolution,
  type PassiveFeedbackSignal,
} from '../../lib/passive-feedback';
import { useHealthStore } from '../StatusBar/healthStore';
import { useFeedbackStore } from './store';
import './PassiveFeedback.css';

interface QueuedIncident extends PassiveFeedbackIncident {
  id: number;
}

const SEEN_STORAGE_KEY = 'forgeax.feedback.passive.seen';
let incidentSequence = 1;

function loadSeen(): Set<string> {
  try {
    const value = JSON.parse(sessionStorage.getItem(SEEN_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistSeen(seen: Set<string>): void {
  try { sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...seen])); } catch { /* best effort */ }
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function useComposerPortal(active: boolean): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) { setTarget(null); return; }
    let slot: HTMLElement | null = null;
    const attach = () => {
      if (slot?.isConnected) return;
      const composer = document.querySelector('.chat-panel .composer');
      if (!(composer instanceof HTMLElement) || !composer.parentElement) return;
      slot = document.createElement('div');
      slot.className = 'feedback-passive-chat-slot';
      composer.parentElement.insertBefore(slot, composer);
      setTarget(slot);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      slot?.remove();
      setTarget(null);
    };
  }, [active]);
  return target;
}

function PassiveFeedbackCard({
  incident,
  onDismiss,
  onPrimary,
}: {
  incident: QueuedIncident;
  onDismiss: () => void;
  onPrimary: () => void;
}) {
  const { t } = useTranslation();
  const body = (<>
      <p className="feedback-passive-summary">{incident.summary}</p>
      {incident.stack && (
        <details className="feedback-passive-stack">
          <summary>{t('feedback.passive.fullStack')}<ChevronDown size={15} /></summary>
          <pre>{incident.stack}</pre>
        </details>
      )}
      <footer className="feedback-passive-actions">
        <button type="button" className="feedback-passive-primary" onClick={onPrimary}>
          {t(incident.actionKey)}
        </button>
        <button type="button" className="feedback-passive-ignore" onClick={onDismiss}>
          {t('feedback.passive.ignore')}
        </button>
      </footer>
  </>);
  const card = (
    <section
      className={`feedback-passive-card feedback-passive-card--${incident.placement}`}
      role={incident.placement === 'center' ? 'alertdialog' : 'alert'}
      aria-modal={incident.placement === 'center' ? true : undefined}
      aria-labelledby={`feedback-passive-title-${incident.id}`}
    >
      <button
        type="button"
        className="feedback-passive-close"
        aria-label={t('feedback.passive.dismiss')}
        title={t('feedback.passive.dismiss')}
        onClick={onDismiss}
      >
        <X size={17} />
      </button>
      {incident.placement !== 'chat' && (
      <header className="feedback-passive-header">
        <span className="feedback-passive-icon" aria-hidden="true"><AlertTriangle size={18} /></span>
        <h2 id={`feedback-passive-title-${incident.id}`}>{t(incident.titleKey)}</h2>
      </header>
      )}
      {incident.placement === 'chat' ? (
        <details className="feedback-passive-disclosure" key={incident.id}>
          <summary className="feedback-passive-header">
            <span className="feedback-passive-icon" aria-hidden="true"><AlertTriangle size={16} /></span>
            <span id={`feedback-passive-title-${incident.id}`}>{t(incident.titleKey)}</span>
            <ChevronDown className="feedback-passive-chevron" size={14} aria-hidden="true" />
          </summary>
          {body}
        </details>
      ) : body}
    </section>
  );

  return incident.placement === 'center'
    ? <div className="feedback-passive-backdrop">{card}</div>
    : card;
}

export function PassiveFeedbackHost() {
  const host = useHost();
  const [incidents, setIncidents] = useState<QueuedIncident[]>([]);
  const classifier = useMemo(() => createPassiveFeedbackClassifier(), []);
  const seenRef = useRef(loadSeen());
  const lastHealthIdRef = useRef(0);
  const current = incidents[0] ?? null;
  const composerTarget = useComposerPortal(current?.placement === 'chat');

  const enqueue = useCallback((incident: PassiveFeedbackIncident) => {
    // Requirements §4: "右下角轻量卡片。同一异常类型同一会话只询问一次,避免检测器
    // 重复弹出。" The session-once rule is scoped to the corner placement, whose
    // sources are polling detectors (heartbeat drift, uncaught-error windows,
    // build retries) that would otherwise re-prompt endlessly. Center failures
    // (save / GPU / Play / renderer / runtime) and the Agent card are per-attempt
    // user-visible failures — muting them for the rest of the session would hide
    // a second failed save entirely.
    if (incident.placement === 'corner') {
      if (seenRef.current.has(incident.exceptionKey)) return;
      seenRef.current.add(incident.exceptionKey);
      persistSeen(seenRef.current);
    }
    setIncidents((currentIncidents) => {
      // Never stack the same incident, but keep differently scoped agent
      // attempts separate so recovering one session/agent does not hide a
      // still-unresponsive peer.
      if (currentIncidents.some((queued) => {
        if (queued.exceptionKey !== incident.exceptionKey) return false;
        if (incident.placement !== 'chat' || queued.placement !== 'chat') return true;
        return matchesPassiveFeedbackScope(queued.scope, incident.scope)
          && matchesPassiveFeedbackScope(incident.scope, queued.scope);
      })) {
        return currentIncidents;
      }
      return [...currentIncidents, { ...incident, id: incidentSequence++ }];
    });
  }, []);

  useEffect(() => {
    const ingest = (signal: PassiveFeedbackSignal) => {
      const incident = classifier.ingest(signal);
      if (incident) enqueue(incident);
    };

    const onSignal = (event: Event) => {
      const detail = (event as CustomEvent<PassiveFeedbackSignal>).detail;
      if (detail && typeof detail.code === 'string' && typeof detail.message === 'string') ingest(detail);
    };
    window.addEventListener(PASSIVE_FEEDBACK_EVENT, onSignal);

    const onRecovered = (event: Event) => {
      const detail = (event as CustomEvent<PassiveFeedbackResolution>).detail;
      if (!detail || typeof detail.exceptionKey !== 'string') return;
      setIncidents((currentIncidents) => currentIncidents.filter((incident) =>
        incident.exceptionKey !== detail.exceptionKey || !matchesPassiveFeedbackScope(incident.scope, detail.scope)));
    };
    window.addEventListener(PASSIVE_FEEDBACK_RECOVERED_EVENT, onRecovered);

    const ingestHealth = () => {
      for (const entry of useHealthStore.getState().entries) {
        if (entry.id <= lastHealthIdRef.current) continue;
        lastHealthIdRef.current = entry.id;
        ingest({ code: entry.code ?? '', message: entry.message, source: entry.source, ts: entry.ts });
      }
    };
    ingestHealth();
    const unsubscribe = useHealthStore.subscribe(ingestHealth);

    let expected = performance.now() + 1_000;
    // Hidden documents can throttle or suspend timers without blocking the UI.
    // Start a fresh sample when the document returns from the background.
    const resetHeartbeat = () => { expected = performance.now() + 1_000; };
    document.addEventListener('visibilitychange', resetHeartbeat);
    window.addEventListener('pageshow', resetHeartbeat);
    const heartbeat = window.setInterval(() => {
      const now = performance.now();
      const drift = now - expected;
      expected = now + 1_000;
      if (document.visibilityState === 'visible' && drift >= 5_000) {
        reportPassiveFeedbackSignal({
          code: 'main-thread-stall',
          message: `Main thread was unresponsive for ${Math.round(drift / 1_000)} seconds`,
        });
      }
    }, 1_000);

    return () => {
      window.removeEventListener(PASSIVE_FEEDBACK_EVENT, onSignal);
      window.removeEventListener(PASSIVE_FEEDBACK_RECOVERED_EVENT, onRecovered);
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', resetHeartbeat);
      window.removeEventListener('pageshow', resetHeartbeat);
      unsubscribe();
    };
  }, [classifier, enqueue]);

  useEffect(() => {
    if (current?.placement !== 'chat') return;
    const state = useShellStore.getState();
    if (state.chatpanelCollapsed) state.toggleChatpanel();
  }, [current]);

  const dismissCurrent = useCallback(() => {
    setIncidents((currentIncidents) => currentIncidents.slice(1));
  }, []);

  const submitAndRecover = useCallback(async () => {
    if (!current) return;
    dismissCurrent();
    await nextPaint();

    const diagnostic = `[passive-feedback/${current.exceptionKey}] ${current.summary}${current.stack ? `\n${current.stack}` : ''}`;
    // /api/feedback 的唯一出口是 store(见 store.ts 文件头 SSOT 注释 +
    // scripts/agnostic-api-policy.ts);这里只描述事实,采集与上报都归它。
    const submit = useFeedbackStore.getState().submitAuto({
      exceptionKey: current.exceptionKey,
      diagnostic,
    });

    if (current.recovery.kind === 'command') {
      await Promise.allSettled([submit, host.commands.execute(current.recovery.commandId)]);
      return;
    }
    if (current.recovery.kind === 'reload-page') {
      await submit;
      window.location.reload();
      return;
    }
    await submit;
  }, [current, dismissCurrent, host]);

  if (!current) return null;
  const card = (
    <PassiveFeedbackCard
      incident={current}
      onDismiss={dismissCurrent}
      onPrimary={() => { void submitAndRecover(); }}
    />
  );
  if (current.placement === 'chat' && composerTarget) return createPortal(card, composerTarget);
  return card;
}
