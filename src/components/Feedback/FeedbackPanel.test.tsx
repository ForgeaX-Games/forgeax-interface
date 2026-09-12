import '../../lib/telemetry-test-prelude';
import React from 'react';
import { afterEach, expect, spyOn, test } from 'bun:test';
import { act, cleanup, render } from '@testing-library/react';
import type { FeedbackReport } from '@forgeax/types/feedback';
import { createAppHost, HostProvider } from '../../core/app-shell';
import { FeedbackPanel } from './FeedbackPanel';
import { useFeedbackStore } from './store';

const realFetch = globalThis.fetch;
const { host } = createAppHost();
const renderFeedbackPanel = () => render(
  <HostProvider value={host}>
    <FeedbackPanel />
  </HostProvider>,
);
const report: FeedbackReport = {
  id: 'FB-test', type: 'other', source: 'manual', title: 'other',
  description: 'Feedback delivery test', status: 'processing', count: 1,
  createdAt: '2026-09-10T09:00:00Z', updatedAt: '2026-09-10T09:00:00Z',
  delivery: { status: 'uploading', occurrence: 1, attempts: 1, updatedAt: '2026-09-10T09:00:00Z' },
};

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  useFeedbackStore.setState({ open: false, tab: 'write', reports: [], loading: false, refreshFailed: false });
});

test('refreshes delivery without hiding cards and stops when the panel closes', async () => {
  let tick: (() => Promise<void>) | undefined;
  let polls = 0;
  const originalTimeout = globalThis.setTimeout;
  const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 5_000) {
      tick = callback as () => Promise<void>;
      polls += 1;
      return 12345;
    }
    return originalTimeout(callback, delay, ...args);
  }) as typeof setTimeout);
  const clear = spyOn(globalThis, 'clearTimeout');
  let finish!: (response: Response) => void;
  globalThis.fetch = (() => new Promise<Response>((resolve) => { finish = resolve; })) as typeof fetch;
  useFeedbackStore.setState({ open: true, tab: 'mine', reports: [report], loading: false });
  try {
    renderFeedbackPanel();
    expect(tick).toBeDefined();
    let refreshing!: Promise<void>;
    await act(async () => { refreshing = tick!(); });
    expect(useFeedbackStore.getState().loading).toBe(false);
    expect(document.querySelector('.feedback-report')).not.toBeNull();
    expect(polls).toBe(1);
    await act(async () => {
      finish(Response.json({ ok: true, reports: [{ ...report, delivery: { ...report.delivery, status: 'failed' } }] }));
      await refreshing;
    });
    expect(document.querySelector('.feedback-delivery--failed')).not.toBeNull();
    expect(polls).toBe(2);
    await act(async () => { useFeedbackStore.getState().closePanel(); });
    expect(clear).toHaveBeenCalledWith(12345);
    expect(polls).toBe(2);
  } finally {
    cleanup();
    timer.mockRestore();
    clear.mockRestore();
  }
});

test('background refresh marks cached reports stale and clears the warning on recovery', async () => {
  useFeedbackStore.setState({ reports: [report], loading: false, open: true, tab: 'mine' });
  renderFeedbackPanel();
  globalThis.fetch = (() => Promise.resolve(Response.json({ ok: false }, { status: 500 }))) as typeof fetch;
  await act(async () => { await useFeedbackStore.getState().loadReports({ silent: true }); });
  expect(useFeedbackStore.getState().reports).toEqual([report]);
  expect(useFeedbackStore.getState().loading).toBe(false);
  expect(useFeedbackStore.getState().refreshFailed).toBe(true);
  expect(document.querySelector('[role="status"]')).not.toBeNull();
  globalThis.fetch = (() => Promise.resolve(Response.json({ ok: true, reports: [report] }))) as typeof fetch;
  await act(async () => { await useFeedbackStore.getState().loadReports({ silent: true }); });
  expect(useFeedbackStore.getState().refreshFailed).toBe(false);
  expect(document.querySelector('[role="status"]')).toBeNull();
});

test('tab entry and polling share a slow request without stale responses racing', async () => {
  let calls = 0;
  let finish!: (response: Response) => void;
  globalThis.fetch = (() => {
    calls += 1;
    return new Promise<Response>((resolve) => { finish = resolve; });
  }) as typeof fetch;
  useFeedbackStore.getState().setTab('mine');
  const poll = useFeedbackStore.getState().loadReports({ silent: true });
  expect(calls).toBe(1);
  finish(Response.json({ ok: true, reports: [report] }));
  await poll;
  expect(useFeedbackStore.getState().loading).toBe(false);
  expect(useFeedbackStore.getState().reports).toEqual([report]);
});
