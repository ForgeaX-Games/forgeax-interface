import '../../lib/telemetry-test-prelude';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { act, cleanup, render } from '@testing-library/react';
import { createAppHost, HostProvider } from '../../core/app-shell';
import { PASSIVE_FEEDBACK_EVENT, type PassiveFeedbackSignal } from '../../lib/passive-feedback';
import { useHealthStore } from '../StatusBar/healthStore';
import { PassiveFeedbackHost } from './PassiveFeedback';

const restorers: (() => void)[] = [];
afterEach(() => {
  cleanup();
  for (const restore of restorers.splice(0).reverse()) restore();
  sessionStorage.removeItem('forgeax.feedback.passive.seen');
});

function fixture() {
  let now = 0;
  let visibility: DocumentVisibilityState = 'visible';
  const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  const clock = spyOn(performance, 'now').mockImplementation(() => now);
  const callbacks: (() => void)[] = [];
  const originalSet = window.setInterval.bind(window);
  const timer = spyOn(window, 'setInterval').mockImplementation(((callback: () => void, delay?: number) => {
    if (delay !== 1000) return originalSet(callback, delay);
    callbacks.push(callback);
    return 950000 + callbacks.length;
  }) as typeof window.setInterval);
  const signals: PassiveFeedbackSignal[] = [];
  const receive = (event: Event) => signals.push((event as CustomEvent<PassiveFeedbackSignal>).detail);
  window.addEventListener(PASSIVE_FEEDBACK_EVENT, receive);
  restorers.push(() => {
    window.removeEventListener(PASSIVE_FEEDBACK_EVENT, receive);
    timer.mockRestore(); clock.mockRestore();
    if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
    else delete (document as unknown as Record<string, unknown>).visibilityState;
  });
  useHealthStore.setState({ entries: [] });
  const { host } = createAppHost();
  const view = render(<HostProvider value={host}><PassiveFeedbackHost /></HostProvider>);
  return {
    signals, view,
    tick: (time: number) => { now = time; act(() => callbacks.at(-1)!()); },
    visibility: (value: DocumentVisibilityState, time: number) => {
      now = time; visibility = value;
      act(() => document.dispatchEvent(new Event('visibilitychange')));
    },
  };
}

describe('main-thread stall detection', () => {
  it('ignores throttled timers while hidden and starts a new measurement on return', () => {
    const f = fixture();
    f.visibility('hidden', 500);
    f.tick(60000);
    f.visibility('visible', 120000);
    f.tick(121000);
    expect(f.signals).toEqual([]);
    expect(f.view.queryByRole('alert')).toBeNull();
    f.tick(128000);
    expect(f.signals).toEqual([{ code: 'main-thread-stall', durationMs: 6000, message: 'Main thread was unresponsive for 6 seconds' }]);
  });

  it('discards an entire suspension with no intervening timer callback', () => {
    const f = fixture();
    f.visibility('hidden', 500);
    f.visibility('visible', 3600000);
    f.tick(3601000);
    expect(f.signals).toEqual([]);
  });

  it('continues to report a genuine foreground stall', () => {
    const f = fixture();
    f.tick(7000);
    expect(f.signals).toHaveLength(1);
    expect(f.view.getByRole('alert')).toBeTruthy();
  });
});
