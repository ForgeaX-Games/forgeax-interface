import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* shared test preload already registered */ }

import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { configureSessionClient, type SessionClient } from './session-client';
import { useShellStore, type AppState } from '../store';
import { DialogHost } from '../lib/dialog';

const initialState = useShellStore.getState();

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for closeSession');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function makeClient(
  deleteSession: SessionClient['deleteSession'],
  overrides: Partial<SessionClient> = {},
): SessionClient {
  return {
    fetchSessionList: async () => [],
    createSession: async () => ({ sid: 'replacement', bootstrappedAgent: null }),
    ensureSession: async () => ({ sid: 'replacement', bootstrappedAgent: null, created: false }),
    deleteSession,
    emitForgeaXMessage: async () => ({ ok: true }),
    listSessionAgents: async () => [],
    connectForgeaXWs: () => {},
    disconnectForgeaXWs: () => {},
    onSessionEvent: () => () => {},
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  useShellStore.setState(initialState, true);
});

describe('closeSession', () => {
  it('keeps the session and its per-session state when the server rejects deletion', async () => {
    const failure = new Error('DELETE failed: HTTP 503');
    configureSessionClient(makeClient(async () => { throw failure; }));
    useShellStore.setState({
      tabs: [
        { sid: 'session-one', displayName: 'One', agentId: 'agent-one', providerOverride: null },
        { sid: 'session-two', displayName: 'Two', agentId: 'agent-two', providerOverride: null },
      ],
      activeSid: 'session-one',
      currentSessionId: 'session-one',
      liveAgents: { 'session-one': [{ path: 'agent-one', display: 'Agent one', parent: null, running: true, depth: 0 }] },
      agentFileActivity: { 'session-one': { 'agent-one': [] } },
      agentBySid: { 'session-one': 'agent-one' },
      busyByAgentBySid: { 'session-one': { 'agent-one': true } },
    } satisfies Partial<AppState>);

    await useShellStore.getState().closeSession('session-one');

    const state = useShellStore.getState();
    expect(state.tabs.map((tab) => tab.sid)).toEqual(['session-one', 'session-two']);
    expect(state.activeSid).toBe('session-one');
    expect(state.currentSessionId).toBe('session-one');
    expect(state.liveAgents['session-one']).toBeTruthy();
    expect(state.agentFileActivity['session-one']).toBeTruthy();
    expect(state.agentBySid['session-one']).toBe('agent-one');
    expect(state.busyByAgentBySid['session-one']).toBeTruthy();

    render(createElement(DialogHost));
    expect(screen.getByRole('alertdialog', { name: 'Failed to delete conversation' })).toBeTruthy();
    expect(screen.getByText('The conversation was kept. DELETE failed: HTTP 503')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'OK' })); });
  });

  it('removes the last deleted sid before awaiting its replacement session', async () => {
    const replacement = deferred<{ sid: string; bootstrappedAgent: string | null }>();
    const connectCalls: Array<string | null> = [];
    let createCalls = 0;
    configureSessionClient(makeClient(async () => {}, {
      createSession: async () => {
        createCalls += 1;
        return replacement.promise;
      },
      connectForgeaXWs: (sid) => { connectCalls.push(sid); },
    }));
    useShellStore.setState({
      tabs: [{ sid: 'session-last', agentId: 'agent-last', providerOverride: null }],
      activeSid: 'session-last',
      currentSessionId: 'session-last',
      liveAgents: { 'session-last': [] },
      agentFileActivity: { 'session-last': { 'agent-last': [] } },
      agentBySid: { 'session-last': 'agent-last' },
      busyByAgentBySid: { 'session-last': { 'agent-last': true } },
    } satisfies Partial<AppState>);

    const closing = useShellStore.getState().closeSession('session-last');
    await waitFor(() => createCalls === 1);

    const waitingState = useShellStore.getState();
    expect(waitingState.tabs).toEqual([]);
    expect(waitingState.activeSid).toBeNull();
    expect(waitingState.currentSessionId).toBeNull();
    expect(waitingState.agentBySid['session-last']).toBeUndefined();
    expect(localStorage.getItem('forgeax.activeSid')).toBeNull();
    expect(connectCalls).toEqual([null]);

    replacement.resolve({ sid: 'session-replacement', bootstrappedAgent: null });
    await closing;

    expect(useShellStore.getState().tabs.map((tab) => tab.sid)).toEqual(['session-replacement']);
    expect(useShellStore.getState().activeSid).toBe('session-replacement');
    expect(connectCalls).toEqual([null, 'session-replacement']);
  });
});
