import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* shared test preload already registered */ }

import { afterEach, describe, expect, it } from 'bun:test';
import { configureSessionClient, type SessionClient } from './session-client';
import { configureStudioDomainClients, type StudioProjectClient } from './domain-clients';
import { useShellStore, type AppState } from '../store';

const initialState = useShellStore.getState();
const originalFetch = globalThis.fetch;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function makeClient(overrides: Partial<SessionClient> = {}): SessionClient {
  return {
    fetchSessionList: async () => [],
    createSession: async () => ({ sid: 'unused', bootstrappedAgent: null }),
    ensureSession: async () => ({ sid: 'unused', bootstrappedAgent: null, created: false }),
    deleteSession: async () => {},
    emitForgeaXMessage: async () => ({ ok: true }),
    listSessionAgents: async () => [],
    connectForgeaXWs: () => {},
    disconnectForgeaXWs: () => {},
    onSessionEvent: () => () => {},
    ...overrides,
  };
}

function commandResponse(data: unknown): Response {
  return new Response(JSON.stringify({ result: { ok: true, data } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for switch request');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function installDeferredModelCatalogs(catalogs: Deferred<Response>[]): () => number {
  let catalogCalls = 0;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes('/api/commands/list_models/query')) {
      const pending = catalogs[catalogCalls++];
      if (!pending) throw new Error('unexpected extra catalog request');
      return pending.promise;
    }
    if (url.includes('/api/commands/get_agent_model/query')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { args?: string[] };
      const [sid = '', agentPath = ''] = body.args ?? [];
      return commandResponse({ sid, agentPath, selected: 'model-ok', chain: ['model-ok'], raw: ['model-ok'] });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return () => catalogCalls;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  localStorage.clear();
  useShellStore.setState(initialState, true);
});

describe('switchToSession', () => {
  it('keeps the latest activation when an earlier model reconcile finishes last', async () => {
    const connectCalls: string[] = [];
    const agentSyncCalls: string[] = [];
    configureSessionClient(makeClient({
      listSessionAgents: async (sid) => { agentSyncCalls.push(sid); return []; },
      connectForgeaXWs: (sid) => { connectCalls.push(sid); },
    }));

    const catalogs = [deferred<Response>(), deferred<Response>()];
    const catalogCalls = installDeferredModelCatalogs(catalogs);

    useShellStore.setState({
      tabs: [
        { sid: 'session-a', agentId: 'agent-a', providerOverride: null },
        { sid: 'session-b', agentId: 'agent-b', providerOverride: null },
      ],
      activeSid: 'session-before',
      currentSessionId: 'session-before',
      providerOverride: null,
    } satisfies Partial<AppState>);

    const switchA = useShellStore.getState().switchToSession('session-a');
    await waitFor(() => catalogCalls() === 1);
    const switchB = useShellStore.getState().switchToSession('session-b');
    await waitFor(() => catalogCalls() === 2);

    catalogs[1]!.resolve(commandResponse({ models: [{ id: 'model-ok' }] }));
    await switchB;
    expect(useShellStore.getState().activeSid).toBe('session-b');

    catalogs[0]!.resolve(commandResponse({ models: [{ id: 'model-ok' }] }));
    await switchA;

    expect(useShellStore.getState().activeSid).toBe('session-b');
    expect(useShellStore.getState().currentSessionId).toBe('session-b');
    expect(localStorage.getItem('forgeax.activeSid')).toBe('session-b');
    expect(connectCalls).toEqual(['session-b']);
    expect(agentSyncCalls).toEqual(['session-b']);
  });

  it('does not let an older switch override a newly-created active session', async () => {
    const connectCalls: Array<string | null> = [];
    const agentSyncCalls: string[] = [];
    configureSessionClient(makeClient({
      createSession: async () => ({ sid: 'session-new', bootstrappedAgent: 'root' }),
      listSessionAgents: async (sid) => { agentSyncCalls.push(sid); return []; },
      connectForgeaXWs: (sid) => { connectCalls.push(sid); },
    }));
    const catalog = deferred<Response>();
    const catalogCalls = installDeferredModelCatalogs([catalog]);
    useShellStore.setState({
      tabs: [
        { sid: 'session-before', agentId: 'agent-before', providerOverride: null },
        { sid: 'session-a', agentId: 'agent-a', providerOverride: null },
      ],
      activeSid: 'session-before',
      currentSessionId: 'session-before',
      providerOverride: null,
    } satisfies Partial<AppState>);

    const switchA = useShellStore.getState().switchToSession('session-a');
    await waitFor(() => catalogCalls() === 1);
    await useShellStore.getState().createNewSession();
    expect(useShellStore.getState().activeSid).toBe('session-new');

    catalog.resolve(commandResponse({ models: [{ id: 'model-ok' }] }));
    await switchA;

    expect(useShellStore.getState().activeSid).toBe('session-new');
    expect(useShellStore.getState().currentSessionId).toBe('session-new');
    expect(localStorage.getItem('forgeax.activeSid')).toBe('session-new');
    expect(connectCalls).toEqual(['session-new']);
    expect(agentSyncCalls).toEqual(['session-new']);
  });

  it('does not reactivate a session deleted while its reconcile is pending', async () => {
    const connectCalls: Array<string | null> = [];
    const agentSyncCalls: string[] = [];
    configureSessionClient(makeClient({
      listSessionAgents: async (sid) => { agentSyncCalls.push(sid); return []; },
      connectForgeaXWs: (sid) => { connectCalls.push(sid); },
    }));
    const catalog = deferred<Response>();
    const catalogCalls = installDeferredModelCatalogs([catalog]);
    useShellStore.setState({
      tabs: [
        { sid: 'session-before', agentId: 'agent-before', providerOverride: null },
        { sid: 'session-a', agentId: 'agent-a', providerOverride: null },
      ],
      activeSid: 'session-before',
      currentSessionId: 'session-before',
      providerOverride: null,
    } satisfies Partial<AppState>);

    const switchA = useShellStore.getState().switchToSession('session-a');
    await waitFor(() => catalogCalls() === 1);
    await useShellStore.getState().closeSession('session-a');

    catalog.resolve(commandResponse({ models: [{ id: 'model-ok' }] }));
    await switchA;

    expect(useShellStore.getState().tabs.map((tab) => tab.sid)).toEqual(['session-before']);
    expect(useShellStore.getState().activeSid).toBe('session-before');
    expect(useShellStore.getState().currentSessionId).toBe('session-before');
    expect(localStorage.getItem('forgeax.activeSid')).toBe('session-before');
    expect(connectCalls).toEqual(['session-before']);
    expect(agentSyncCalls).toEqual(['session-before']);
  });

  it('does not commit a switch whose target disappeared during a session refresh', async () => {
    const connectCalls: Array<string | null> = [];
    configureSessionClient(makeClient({
      fetchSessionList: async () => [{ sid: 'session-before' }],
      connectForgeaXWs: (sid) => { connectCalls.push(sid); },
    }));
    const catalog = deferred<Response>();
    const catalogCalls = installDeferredModelCatalogs([catalog]);
    useShellStore.setState({
      tabs: [
        { sid: 'session-before', agentId: 'agent-before', providerOverride: null },
        { sid: 'session-a', agentId: 'agent-a', providerOverride: null },
      ],
      activeSid: 'session-before',
      currentSessionId: 'session-before',
      providerOverride: null,
    } satisfies Partial<AppState>);

    const switchA = useShellStore.getState().switchToSession('session-a');
    await waitFor(() => catalogCalls() === 1);
    await useShellStore.getState().refreshSessions();
    catalog.resolve(commandResponse({ models: [{ id: 'model-ok' }] }));
    await switchA;

    expect(useShellStore.getState().tabs.map((tab) => tab.sid)).toEqual(['session-before']);
    expect(useShellStore.getState().activeSid).toBe('session-before');
    expect(connectCalls).toEqual([]);
  });

  it('keeps a valid explicit switch alive across a refresh that preserves the active session', async () => {
    const connectCalls: Array<string | null> = [];
    configureSessionClient(makeClient({
      fetchSessionList: async () => [{ sid: 'session-before' }, { sid: 'session-a' }],
      connectForgeaXWs: (sid) => { connectCalls.push(sid); },
    }));
    const catalog = deferred<Response>();
    const catalogCalls = installDeferredModelCatalogs([catalog]);
    useShellStore.setState({
      tabs: [
        { sid: 'session-before', agentId: 'agent-before', providerOverride: null },
        { sid: 'session-a', agentId: 'agent-a', providerOverride: null },
      ],
      activeSid: 'session-before',
      currentSessionId: 'session-before',
      providerOverride: null,
    } satisfies Partial<AppState>);

    const switchA = useShellStore.getState().switchToSession('session-a');
    await waitFor(() => catalogCalls() === 1);
    await useShellStore.getState().refreshSessions();
    catalog.resolve(commandResponse({ models: [{ id: 'model-ok' }] }));
    await switchA;

    expect(useShellStore.getState().activeSid).toBe('session-a');
    expect(localStorage.getItem('forgeax.activeSid')).toBe('session-a');
    expect(connectCalls).toEqual(['session-a']);
  });

  it('keeps a valid explicit switch authoritative when refresh replaces a missing active session', async () => {
    const connectCalls: Array<string | null> = [];
    configureSessionClient(makeClient({
      fetchSessionList: async () => [
        { sid: 'session-a', lastActivityAt: 1 },
        { sid: 'session-b', lastActivityAt: 2 },
      ],
      connectForgeaXWs: (sid) => { connectCalls.push(sid); },
    }));
    const catalog = deferred<Response>();
    const catalogCalls = installDeferredModelCatalogs([catalog]);
    useShellStore.setState({
      tabs: [
        { sid: 'session-missing', agentId: 'agent-missing', providerOverride: null },
        { sid: 'session-a', agentId: 'agent-a', providerOverride: null },
        { sid: 'session-b', agentId: 'agent-b', providerOverride: null },
      ],
      activeSid: 'session-missing',
      currentSessionId: 'session-missing',
      providerOverride: null,
    } satisfies Partial<AppState>);

    const switchA = useShellStore.getState().switchToSession('session-a');
    await waitFor(() => catalogCalls() === 1);
    await useShellStore.getState().refreshSessions();
    expect(useShellStore.getState().activeSid).toBe('session-b');

    catalog.resolve(commandResponse({ models: [{ id: 'model-ok' }] }));
    await switchA;

    expect(useShellStore.getState().activeSid).toBe('session-a');
    expect(localStorage.getItem('forgeax.activeSid')).toBe('session-a');
    expect(connectCalls).toEqual(['session-a']);
  });

  it('does not commit a switch from the previous game after a new scope transition is accepted', async () => {
    const connectCalls: Array<string | null> = [];
    const refreshedSessions = deferred<Array<{ sid: string }>>();
    let sessionListCalls = 0;
    let gameTransitionStarted = false;
    configureStudioDomainClients({
      agents: null as never,
      builds: null as never,
      projects: {
        getActiveProject: async () => ({ activeSlug: 'game-before', runtime: { status: 'unbound' } }),
        setActiveProject: async (slug) => ({ activeSlug: slug, runtime: { status: 'unbound' } }),
        subscribeActiveProject: () => () => {},
      } as StudioProjectClient,
    });
    configureSessionClient(makeClient({
      fetchSessionList: async () => {
        sessionListCalls += 1;
        if (!gameTransitionStarted) {
          return [{ sid: 'session-before', lastActivityAt: 2 }, { sid: 'session-a', lastActivityAt: 1 }];
        }
        return refreshedSessions.promise;
      },
      connectForgeaXWs: (sid) => { connectCalls.push(sid); },
    }));
    await useShellStore.getState().initSessions();
    // initSessions is process-global and another test file may already have
    // initialized it. Force one local projection read when the suite reaches
    // this file after that state was established elsewhere.
    if (sessionListCalls === 0) await useShellStore.getState().refreshSessions();
    connectCalls.length = 0;
    const catalog = deferred<Response>();
    const catalogCalls = installDeferredModelCatalogs([catalog]);
    useShellStore.setState({
      tabs: [
        { sid: 'session-before', agentId: 'agent-before', providerOverride: null },
        { sid: 'session-a', agentId: 'agent-a', providerOverride: null },
      ],
      activeSid: 'session-before',
      currentSessionId: 'session-before',
      providerOverride: null,
      activeGameSlug: 'game-before',
      activeGameRuntime: { status: 'unbound' },
      activeGameResolved: true,
    } satisfies Partial<AppState>);

    const switchA = useShellStore.getState().switchToSession('session-a');
    await waitFor(() => catalogCalls() === 1);
    const beforeTransitionCalls = sessionListCalls;
    gameTransitionStarted = true;
    const gameTransition = useShellStore.getState().applyActiveGame({
      // Use a test-unique key: another file may leave a completed/pending
      // transition cached for the ordinary null/unbound projection.
      activeSlug: 'game-after-switch-fence',
      runtime: { status: 'unbound' },
    });
    await waitFor(() => sessionListCalls === beforeTransitionCalls + 1);

    catalog.resolve(commandResponse({ models: [{ id: 'model-ok' }] }));
    await switchA;

    // The accepted scope transition must fence the old switch before its
    // session-list refresh completes.
    expect(useShellStore.getState().activeGameSlug).toBe('game-after-switch-fence');
    expect(useShellStore.getState().activeSid).toBe('session-before');
    expect(connectCalls).toEqual([]);

    refreshedSessions.resolve([{ sid: 'session-before' }, { sid: 'session-a' }]);
    await gameTransition;
    expect(useShellStore.getState().activeSid).toBe('session-before');
  });

  it('does not let a late session list from game A overwrite the accepted game B projection', async () => {
    const sessionsA = deferred<Array<{ sid: string; lastActivityAt?: number }>>();
    const sessionsB = deferred<Array<{ sid: string; lastActivityAt?: number }>>();
    const requestedScopes: Array<string | undefined> = [];
    const connectCalls: Array<string | null> = [];

    configureStudioDomainClients({
      agents: null as never,
      builds: null as never,
      projects: {
        getActiveProject: async () => ({ activeSlug: 'game-before', runtime: { status: 'ready' } }),
        setActiveProject: async (slug) => ({ activeSlug: slug, runtime: { status: 'ready' } }),
        subscribeActiveProject: () => () => {},
      } as StudioProjectClient,
    });
    configureSessionClient(makeClient({
      fetchSessionList: async (scope) => {
        requestedScopes.push(scope);
        if (scope === 'game-before') return [{ sid: 'session-before', lastActivityAt: 1 }];
        if (scope === 'game-a') return sessionsA.promise;
        if (scope === 'game-b') return sessionsB.promise;
        throw new Error(`unexpected scope ${String(scope)}`);
      },
      connectForgeaXWs: (sid) => { connectCalls.push(sid); },
    }));
    useShellStore.setState({
      tabs: [],
      activeSid: null,
      currentSessionId: null,
      activeGameSlug: null,
      activeGameRuntime: { status: 'unbound' },
      activeGameResolved: false,
    } satisfies Partial<AppState>);
    await useShellStore.getState().initSessions();
    connectCalls.length = 0;

    const transitionA = useShellStore.getState().applyActiveGame({
      activeSlug: 'game-a',
      runtime: { status: 'ready' },
    });
    await waitFor(() => requestedScopes.includes('game-a'));
    const transitionB = useShellStore.getState().applyActiveGame({
      activeSlug: 'game-b',
      runtime: { status: 'ready' },
    });
    await waitFor(() => requestedScopes.includes('game-b'));

    sessionsB.resolve([{ sid: 'session-b', lastActivityAt: 2 }]);
    await transitionB;
    expect(useShellStore.getState().activeGameSlug).toBe('game-b');
    expect(useShellStore.getState().tabs.map((tab) => tab.sid)).toEqual(['session-b']);

    sessionsA.resolve([{ sid: 'session-a', lastActivityAt: 3 }]);
    await transitionA;

    expect(useShellStore.getState().activeGameSlug).toBe('game-b');
    expect(useShellStore.getState().tabs.map((tab) => tab.sid)).toEqual(['session-b']);
    expect(useShellStore.getState().activeSid).toBe('session-b');
    expect(localStorage.getItem('forgeax.activeSid')).toBe('session-b');
    expect(connectCalls).toEqual(['session-b']);
  });
});
