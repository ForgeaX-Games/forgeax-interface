import { useTranslation } from '@/i18n';
import { dashApi } from '../../lib/dashboard-api';
import { useSharedHealth } from '../../lib/shell-live-data';
import { useShellStore } from '../../store';

type BusState =
  | { kind: 'loading' }
  | { kind: 'down'; reason: string }
  | { kind: 'ok'; extensionCount: number; brokenCount: number; listenerCount: number; ringSize: number };

function classify(bus: NonNullable<Awaited<ReturnType<typeof dashApi.health>>['bus']>): BusState {
  return {
    kind: 'ok',
    extensionCount: bus.extensionCount,
    brokenCount: bus.brokenCount,
    listenerCount: bus.listenerCount,
    ringSize: bus.ringSize,
  };
}

// P3.87 (2026-05-17): Upgrade BusHealthLamp from static <span> chip to
// clickable <button> deep-link → openSettings('plugins') 钻 Bus admin tab. 0 store
// change (reuse setMode), 0 Sidebar.tsx change (Sidebar.tsx player WIP — we
// stay inside BusHealthLamp.tsx + Sidebar.css). When state.kind ≠ 'ok'
// (loading / down), fall back to plain <span> so disabled visual = the same
// as before; only the healthy chip becomes interactive.
//
// P4.48 (2026-05-17): Insert a sub-span `.bus-chip-sigma` rendering "Σ"
// before the count text when state.kind === 'ok'. 5th surface of the
// Σ-prefix muscle-memory language (after AgentsHub header P4.45 + WbGallery
// stats P4.46 + AgentsPanel header P4.47 + BusAdminPanel summary P4.42).
// The extension health chip is the player's most-visible at-all-times
// indicator, so closing the gap here brings the language to the highest
// dwell-time surface. Σ glyph only renders in the healthy ok-state to avoid
// "Σ…" / "Σ down" clutter on loading / down chips. Inline next to the dot,
// 0 layout shift on width (Σ adds ~6px; chip has flex room).
export function BusHealthLamp() {
  const { t } = useTranslation();
  const health = useSharedHealth();
  const openOverlay = useShellStore((s) => s.openOverlay);
  const state: BusState = health.state === 'loading'
    ? { kind: 'loading' }
    : health.state === 'down'
      ? { kind: 'down', reason: 'health request failed' }
      : health.value.bus
        ? classify(health.value.bus)
        : { kind: 'down', reason: 'no bus field' };

  const tone =
    state.kind === 'ok'
      ? state.brokenCount > 0
        ? 'warn'
        : state.extensionCount > 0
          ? 'ok'
          : 'idle'
      : state.kind === 'loading'
        ? 'idle'
        : 'down';

  const baseTitle =
    state.kind === 'ok'
      ? `Bus: ${state.extensionCount} plugin · ${state.brokenCount} broken · ${state.listenerCount} listener · ring ${state.ringSize}`
      : state.kind === 'loading'
        ? 'Bus: loading…'
        : `Bus down: ${state.reason}`;

  const label =
    state.kind === 'ok'
      ? state.brokenCount > 0
        ? `${state.extensionCount - state.brokenCount}/${state.extensionCount}`
        : String(state.extensionCount)
      : state.kind === 'loading'
        ? '…'
        : 'down';

  const isLink = state.kind === 'ok';
  const title = isLink ? t('busHealthLamp.linkTitle', { base: baseTitle }) : baseTitle;

  // P4.48 — Σ glyph rendered only in 'ok' state. In loading/down branches
  // the count slot reads '…' / 'down' and a Σ would read as "Σ down" which
  // is semantically wrong (Σ implies a count). So gate strictly on isLink.
  const showSigma = isLink;

  if (!isLink) {
    return (
      <span className={`bus-chip bus-chip-${tone}`} title={title} aria-label={title}>
        <span className="bus-chip-dot" />
        <span className="bus-chip-text">{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`bus-chip bus-chip-${tone} is-link`}
      title={title}
      aria-label={title}
      onClick={() => openOverlay('settings', 'plugins')}
    >
      <span className="bus-chip-dot" />
      {showSigma && <span className="bus-chip-sigma" aria-hidden="true">Σ</span>}
      <span className="bus-chip-text">{label}</span>
      {state.kind === 'ok' && state.ringSize > 0 && (
        <span
          className="bus-chip-ring"
          aria-hidden="true"
          title={`event ring · ${state.ringSize} recent emits buffered`}
        >
          R{state.ringSize}
        </span>
      )}
      {state.kind === 'ok' && (
        <span
          className="bus-chip-listeners"
          aria-hidden="true"
          title={`listeners · ${state.listenerCount} live subscriber${state.listenerCount === 1 ? '' : 's'} on bus`}
        >
          L{state.listenerCount}
        </span>
      )}
      <span className="bus-chip-arrow" aria-hidden="true">→</span>
    </button>
  );
}
