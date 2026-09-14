import { describe, expect, it } from 'bun:test';
import { initialSessionCatalogModel, passiveSessionCatalogModel, preferredCatalogModel } from '.';

describe('preferredCatalogModel', () => {
  const catalog = [
    { id: 'hidden-default', hidden: true },
    { id: 'visible-default' },
    { id: 'remembered-model' },
  ];

  it('preserves a visible remembered model', () => {
    expect(preferredCatalogModel(catalog, 'remembered-model')).toBe('remembered-model');
  });

  it('falls back to the first visible model when the remembered id is absent or hidden', () => {
    expect(preferredCatalogModel(catalog, 'missing-model')).toBe('visible-default');
    expect(preferredCatalogModel(catalog, 'hidden-default')).toBe('visible-default');
  });
});

describe('initialSessionCatalogModel', () => {
  const catalog = [{ id: 'scaffold-default' }, { id: 'remembered-model' }];

  it('keeps the remembered new-session model even when the scaffold default is also valid', () => {
    expect(initialSessionCatalogModel(catalog, 'claude-code', 'remembered-model')).toBe('remembered-model');
  });

  it('uses a CLI catalog default but leaves a native scaffold alone without a valid memory', () => {
    expect(initialSessionCatalogModel(catalog, 'codex', null)).toBe('scaffold-default');
    expect(initialSessionCatalogModel(catalog, null, null)).toBeUndefined();
  });
});

describe('passiveSessionCatalogModel', () => {
  const nativeCatalog = [{ id: 'claude-fable-5' }];
  it('replaces a foreign-provider selection only with a nonempty destination catalog', () => {
    expect(passiveSessionCatalogModel(nativeCatalog, 'gpt-5.6-luna', null)).toBe('claude-fable-5');
    expect(passiveSessionCatalogModel([{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.6-luna' }], 'claude-opus-4-8', 'gpt-5.6-luna')).toBe('gpt-5.6-luna');
    expect(passiveSessionCatalogModel([], 'gpt-5.6-luna', null)).toBeUndefined();
  });
  it('preserves existing selections still present even if hidden', () => {
    expect(passiveSessionCatalogModel([{ id: 'old', hidden: true }], 'old', 'new')).toBeUndefined();
  });
  it('seeds only an unconfigured session using a valid preference or catalog default', () => {
    expect(passiveSessionCatalogModel(nativeCatalog, null, null)).toBe('claude-fable-5');
    expect(passiveSessionCatalogModel([{ id: 'default' }, { id: 'chosen' }], undefined, 'chosen')).toBe('chosen');
    expect(passiveSessionCatalogModel([], null, null)).toBeUndefined();
  });
});

describe('explicit provider switching', () => {
  it('restores each provider preference through both switching entry points', async () => {
    const { useShellStore } = await import('../../store');
    const { recordLastModel } = await import('../model-prefs');
    const { resetActiveAgentModelToProviderDefault, resetOpenSessionsModelToProviderDefault } = await import('.');
    const before = useShellStore.getState();
    const oldFetch = globalThis.fetch;
    const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    const writes: string[][] = [];
    globalThis.fetch = (async (url: unknown, init: RequestInit) => {
      const { args } = JSON.parse(init.body as string);
      if (String(url).includes('list_models')) return Response.json({ result: { ok: true, data: {
        models: args[0] === 'codex' ? [{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.6-luna' }] : [{ id: 'default' }, { id: 'deepseek-v4-flash' }],
      } } });
      writes.push(args);
      return Response.json({ result: { ok: true, data: { selected: args[2] } } });
    }) as typeof fetch;
    try {
      useShellStore.setState({ activeSid: 'switch-test', providerOverride: 'codex', tabs: [{ sid: 'switch-test', agentId: 'forge' }] as typeof before.tabs });
      recordLastModel('codex', 'gpt-5.6-luna');
      recordLastModel(null, 'deepseek-v4-flash');
      await resetActiveAgentModelToProviderDefault('codex');
      // Settings prepares the destination models before committing the route.
      await resetOpenSessionsModelToProviderDefault(null);
      useShellStore.setState({ providerOverride: null });
      await resetOpenSessionsModelToProviderDefault('codex');
      useShellStore.setState({ providerOverride: 'codex' });
      expect(writes.map((args) => args[2])).toEqual(['gpt-5.6-luna', 'deepseek-v4-flash', 'gpt-5.6-luna']);
    } finally {
      globalThis.fetch = oldFetch;
      useShellStore.setState(before, true);
      if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
