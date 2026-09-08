import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* shared test preload already registered */ }

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { configureSessionClient, type SessionClient } from './session-client';
import { useShellStore, type AppState } from '../store';

const initialState = useShellStore.getState();
const originalFetch = globalThis.fetch;

function makeClient(): SessionClient {
  return {
    fetchSessionList: async () => [],
    createSession: async () => ({ sid: 'session-new', bootstrappedAgent: 'root' }),
    ensureSession: async () => ({ sid: 'session-new', bootstrappedAgent: 'root', created: false }),
    deleteSession: async () => {},
    emitForgeaXMessage: async () => ({ ok: true }),
    listSessionAgents: async () => [],
    connectForgeaXWs: () => {},
    disconnectForgeaXWs: () => {},
    onSessionEvent: () => () => {},
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  useShellStore.setState(initialState, true);
});

describe('createNewSession', () => {
  it('activates the new tab without waiting for a model-catalog request', async () => {
    configureSessionClient(makeClient());
    const fetchModelCatalog = mock(() => new Promise<Response>(() => {}));
    globalThis.fetch = fetchModelCatalog as typeof fetch;
    useShellStore.setState({
      tabs: [{ sid: 'session-old', agentId: 'root', providerOverride: 'claude-code' }],
      activeSid: 'session-old',
      currentSessionId: 'session-old',
      providerOverride: 'claude-code',
    } satisfies Partial<AppState>);

    const result = await Promise.race([
      useShellStore.getState().createNewSession(),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 50)),
    ]);

    expect(result).toEqual({ sid: 'session-new' });
    expect(useShellStore.getState().activeSid).toBe('session-new');
    expect(useShellStore.getState().tabs.map((tab) => tab.sid)).toEqual(['session-old', 'session-new']);
    expect(useShellStore.getState().tabs.at(-1)?.initialModelSeedAgentId).toBe('root');
    expect(fetchModelCatalog).not.toHaveBeenCalled();
  });
});
