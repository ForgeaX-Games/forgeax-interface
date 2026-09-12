/** builtin-actions × manifest 契约一致性(B5,跨包 schema 测试的 interface 半边)。
 *
 *  编排层 `ui-manifest-registry.sanitizeDecl` 的接收规则(cli 侧)在此**镜像成断言**:
 *  id/title 非空、capability ∈ 8 类、inputSchema 可序列化、timeoutMs 正数——任何
 *  builtin action 违反这些规则会在 push 时被 server 整条丢弃(fail-closed → 权限查表
 *  miss → 恒弹卡),这里在测试期就拦下。改任一侧规则时两处同步(cli 侧对应测试:
 *  packages/orchestrator test/ui-bridge.test.ts「manifest 消毒」组)。
 */
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { qualifyContributionId } from '@forgeax/types';
import { buildManifest, snapshotActions, dispatchAction, __resetRegistryForTest } from './action-registry';
import { registerBuiltinActions } from './builtin-actions';
import { useShellStore } from '../store';
import { createAppHost } from '../core/app-shell/host';
import {
  configureSessionClient,
  type SessionClient,
} from '../store-parts/session-client';
import {
  configureStudioDomainClients,
  type ActiveProjectSelection,
  type StudioProjectClient,
} from '../store-parts/domain-clients';
import { __resetCurrentProjectIdForTests } from './project-context';
import { __resetDialogQueueForTests } from './dialog';

const VALID_CAPS = new Set(['read', 'write', 'delete', 'exec', 'network', 'credential', 'delegate', 'other']);
const VALID_SURFACES = new Set(['ui', 'server', 'both']);
const originalFetch = globalThis.fetch;
const initialState = useShellStore.getState();

function sessionClient(overrides: Partial<SessionClient> = {}): SessionClient {
  return {
    fetchSessionList: async () => [],
    createSession: async () => ({ sid: 'created-session', bootstrappedAgent: null }),
    ensureSession: async () => ({ sid: 'ensured-session', bootstrappedAgent: null, created: false }),
    deleteSession: async () => {},
    emitForgeaXMessage: async () => ({ ok: true }),
    listSessionAgents: async () => [],
    connectForgeaXWs: () => {},
    disconnectForgeaXWs: () => {},
    onSessionEvent: () => () => {},
    ...overrides,
  };
}

function configureProjectClient(overrides: Partial<StudioProjectClient> = {}): void {
  configureStudioDomainClients({
    agents: null as never,
    builds: null as never,
    projects: {
      getActiveProject: async () => ({ activeSlug: null }),
      setActiveProject: async (slug) => ({ activeSlug: slug }),
      subscribeActiveProject: () => () => {},
      listProjects: async () => ({ games: [], activeSlug: null }),
      createProject: async () => ({ ok: true }),
      linkProject: async () => ({ ok: true }),
      deleteProject: async () => {},
      ...overrides,
    },
  });
}

function tab(sid: string, displayName = sid) {
  return {
    sid,
    displayName,
    agentId: null,
    providerOverride: null,
  };
}

beforeAll(() => {
  __resetRegistryForTest();
  registerBuiltinActions();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  localStorage.clear();
  __resetCurrentProjectIdForTests();
  __resetDialogQueueForTests();
  configureSessionClient(sessionClient());
  configureProjectClient();
  useShellStore.setState(initialState, true);
});

describe('builtin actions — 全量过 server 侧接收规则', () => {
  test('每条声明:id/title 非空、capability 合法、surface 合法、timeoutMs 正数', () => {
    const manifest = buildManifest();
    expect(manifest.length).toBeGreaterThanOrEqual(10);
    for (const row of manifest) {
      expect(typeof row.id === 'string' && (row.id as string).length > 0).toBe(true);
      expect(typeof row.title === 'string' && (row.title as string).length > 0).toBe(true);
      expect(VALID_CAPS.has(row.capability as string)).toBe(true);
      if ('surface' in row) expect(VALID_SURFACES.has(row.surface as string)).toBe(true);
      if ('timeoutMs' in row) {
        expect(typeof row.timeoutMs === 'number' && (row.timeoutMs as number) > 0).toBe(true);
      }
    }
  });

  test('整表 JSON roundtrip 无损(结构化克隆/HTTP 都能过)', () => {
    const manifest = buildManifest();
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  test('game.create leaves the active conversation intact and provides an available opening path', async () => {
    configureProjectClient({
      createProject: async () => ({ ok: true, session: { sid: 'wildtrail-session' } }),
    });
    useShellStore.setState({ activeGameSlug: 'snake', activeSid: 'current-session' });

    const result = await dispatchAction('game.create', { slug: 'wildtrail' }, { source: 'ai' });

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('creation failed');
    expect(result.stateDigest).toMatchObject({ slug: 'wildtrail', session: 'wildtrail-session' });
    expect(String(result.stateDigest?.hint)).toContain('wildtrail');
    expect(String(result.stateDigest?.hint)).toContain('Ctrl+K');
    expect(String(result.stateDigest?.hint)).toContain('切换游戏');
    expect(String(result.stateDigest?.hint)).toContain('尚不代表游戏制作完成');
    expect(String(result.stateDigest?.hint)).not.toContain('顶栏');
    expect(buildManifest().some((action) => action.id === 'game.switch')).toBe(false);
    expect(useShellStore.getState().activeGameSlug).toBe('snake');
    expect(useShellStore.getState().activeSid).toBe('current-session');
  });

  test('project switching is absent from model discovery and invocation', async () => {
    expect(buildManifest().some((entry) => entry.id === 'game.switch')).toBe(false);
    expect(snapshotActions('schema', ['game.switch']).some((entry) => entry.id === 'game.switch')).toBe(false);
    const result = await dispatchAction('game.switch', { slug: 'another-game' }, { source: 'ai' });
    expect(result.status).toBe('rejected');
    expect(snapshotActions(undefined, undefined, 'human').some((entry) => entry.id === 'game.switch')).toBe(true);
  });

  test('game.switch 写入失败且权威仍是旧游戏时明确拒绝,不谎称预览已切换', async () => {
    configureProjectClient({
      setActiveProject: async () => { throw new Error('setActiveProject → HTTP 404'); },
      getActiveProject: async () => ({ activeSlug: 'game-before', runtime: { status: 'ready' } }),
    });
    useShellStore.setState({
      activeGameSlug: 'game-before',
      activeGameRuntime: { status: 'ready' },
      activeGameResolved: true,
    });

    const result = await dispatchAction('game.switch', { slug: 'missing-game' }, { source: 'human' });

    expect(result.status).toBe('rejected');
    expect(result.status === 'rejected' ? result.reason : '').toContain('active game remains "game-before"');
    expect(useShellStore.getState().activeGameSlug).toBe('game-before');
  });

  test('game.switch 写入报 503 但权威已切换时如实完成并披露运行环境未就绪', async () => {
    configureProjectClient({
      setActiveProject: async () => { throw new Error('setActiveProject → HTTP 503'); },
      getActiveProject: async () => ({
        activeSlug: 'game-after',
        runtime: { status: 'unavailable', error: 'runtime sidecar unavailable' },
      }),
    });
    useShellStore.setState({
      activeGameSlug: 'game-before',
      activeGameRuntime: { status: 'ready' },
      activeGameResolved: true,
    });

    const result = await dispatchAction('game.switch', { slug: 'game-after' }, { source: 'human' });

    expect(result).toEqual({
      status: 'completed',
      stateDigest: {
        activeGameSlug: 'game-after',
        runtimeStatus: 'unavailable',
        warning: 'runtime sidecar unavailable',
      },
    });
    expect(useShellStore.getState().activeGameSlug).toBe('game-after');
  });

  test('game.switch 不允许较慢的旧请求覆盖较新的选择', async () => {
    let resolveOlder!: (selection: ActiveProjectSelection) => void;
    const older = new Promise<ActiveProjectSelection>((resolve) => { resolveOlder = resolve; });
    configureProjectClient({
      setActiveProject: async (slug) => slug === 'game-a'
        ? older
        : { activeSlug: slug, runtime: { status: 'ready' } },
    });

    const first = dispatchAction('game.switch', { slug: 'game-a' }, { source: 'human' });
    await Promise.resolve();
    const second = await dispatchAction('game.switch', { slug: 'game-b' }, { source: 'human' });
    resolveOlder({ activeSlug: 'game-a', runtime: { status: 'ready' } });
    const stale = await first;

    expect(second.status).toBe('completed');
    expect(stale.status).toBe('rejected');
    expect(stale.status === 'rejected' ? stale.reason : '').toContain('superseded by a newer selection');
    expect(useShellStore.getState().activeGameSlug).toBe('game-b');
  });

  test('game.switch 不允许旧请求的延迟权威回读覆盖新选择', async () => {
    let resolveAuthority!: (selection: ActiveProjectSelection) => void;
    const delayedAuthority = new Promise<ActiveProjectSelection>((resolve) => { resolveAuthority = resolve; });
    let markAuthorityRead!: () => void;
    const authorityRead = new Promise<void>((resolve) => { markAuthorityRead = resolve; });
    configureProjectClient({
      setActiveProject: async (slug) => {
        if (slug === 'game-a') throw new Error('setActiveProject → HTTP 503');
        return { activeSlug: slug, runtime: { status: 'ready' } };
      },
      getActiveProject: async () => {
        markAuthorityRead();
        return delayedAuthority;
      },
    });

    const first = dispatchAction('game.switch', { slug: 'game-a' }, { source: 'human' });
    await authorityRead;
    const second = await dispatchAction('game.switch', { slug: 'game-b' }, { source: 'human' });
    resolveAuthority({ activeSlug: 'game-a', runtime: { status: 'ready' } });
    const stale = await first;

    expect(second.status).toBe('completed');
    expect(stale.status).toBe('rejected');
    expect(useShellStore.getState().activeGameSlug).toBe('game-b');
  });

  test('破坏性 action 如实声明 delete(session.close 会弹确认卡,这是有意的)', () => {
    const manifest = buildManifest();
    const close = manifest.find((r) => r.id === 'session.close');
    expect(close?.capability).toBe('delete');
  });

  test('firstClass 只标在高频集上且数量 ≤ 编排层上限 24', () => {
    const fc = buildManifest().filter((r) => r.firstClass === true);
    expect(fc.length).toBeGreaterThanOrEqual(4);
    expect(fc.length).toBeLessThanOrEqual(24);
  });

  test('role.open 带 id 但没有活跃会话时明确拒绝,不冒充已绑定', async () => {
    useShellStore.setState({ tabs: [], activeSid: null, currentSessionId: null, agentBySid: {} });
    const result = await dispatchAction('role.open', { id: 'level-designer' }, { source: 'ai' });

    expect(result).toEqual({
      status: 'rejected',
      reason: 'role.open with id requires an active chat session',
    });
  });

  test('role.open 不把未校验的缓存 activeSid 当成真实会话', async () => {
    useShellStore.setState({
      tabs: [],
      activeSid: 'stale-cached-sid',
      currentSessionId: 'stale-cached-sid',
      agentBySid: {},
    });
    const result = await dispatchAction('role.open', { id: 'level-designer' }, { source: 'ai' });

    expect(result).toEqual({
      status: 'rejected',
      reason: 'role.open with id requires an active chat session',
    });
    expect(useShellStore.getState().agentBySid).toEqual({});
  });

  test('role.open 拒绝 roster 中不存在的角色,不写入绑定', async () => {
    useShellStore.setState({
      tabs: [tab('session-a')],
      activeSid: 'session-a',
      currentSessionId: 'session-a',
      agentBySid: {},
    });
    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: true,
      result: { count: 1, roles: [{ id: 'existing-role' }] },
    }));

    const result = await dispatchAction('role.open', { id: 'missing-role' }, { source: 'ai' });

    expect(result).toEqual({
      status: 'rejected',
      reason: 'role.open could not find role "missing-role" in the current roster',
    });
    expect(useShellStore.getState().tabs[0]?.agentId).toBeNull();
  });

  test('role.open 只在角色和会话都真实存在时绑定并回读', async () => {
    const owner = '@forgeax/studio-agents';
    const pageId = qualifyContributionId(owner, 'page', 'workspace');
    const panelId = qualifyContributionId(owner, 'panel', 'main');
    const { control } = createAppHost();
    const removePage = control.contributePagePlatform(owner, {
      panelTypes: [{ id: panelId, runtime: { kind: 'inline', render: () => null } }],
      pageTypes: [{
        id: pageId,
        title: 'Agents',
        cardinality: 'singleton',
        layout: { version: 1, root: { kind: 'tabs', placements: ['main'] } },
        panels: [{ id: 'main', panelTypeId: panelId }],
      }],
    });
    useShellStore.setState({
      tabs: [tab('session-a')],
      activeSid: 'session-a',
      currentSessionId: 'session-a',
      agentBySid: {},
    });
    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: true,
      result: { count: 1, roles: [{ id: 'level-designer' }] },
    }));

    try {
      const result = await dispatchAction('role.open', { id: 'level-designer' }, { source: 'ai' });

      expect(result).toEqual({
        status: 'completed',
        stateDigest: { opened: 'level-designer', boundSid: 'session-a', activeWorkspace: 'ai' },
      });
      expect(useShellStore.getState().tabs[0]?.agentId).toBe('level-designer');
    } finally {
      await removePage();
      await control.dispose();
    }
  });

  test('role.open 在等待期间切换会话仍绑定调用开始时的 sid', async () => {
    const owner = '@forgeax/studio-agents';
    const pageId = qualifyContributionId(owner, 'page', 'workspace');
    const panelId = qualifyContributionId(owner, 'panel', 'main');
    const { control } = createAppHost();
    const removePage = control.contributePagePlatform(owner, {
      panelTypes: [{ id: panelId, runtime: { kind: 'inline', render: () => null } }],
      pageTypes: [{
        id: pageId,
        title: 'Agents',
        cardinality: 'singleton',
        layout: { version: 1, root: { kind: 'tabs', placements: ['main'] } },
        panels: [{ id: 'main', panelTypeId: panelId }],
      }],
    });
    useShellStore.setState({
      tabs: [tab('session-a'), tab('session-b')],
      activeSid: 'session-a',
      currentSessionId: 'session-a',
      agentBySid: {},
    });
    let releaseRoster!: () => void;
    let markStarted!: () => void;
    const rosterGate = new Promise<void>((resolve) => { releaseRoster = resolve; });
    const requestStarted = new Promise<void>((resolve) => { markStarted = resolve; });
    globalThis.fetch = async () => {
      markStarted();
      await rosterGate;
      return new Response(JSON.stringify({ ok: true, result: { roles: [{ id: 'level-designer' }] } }));
    };

    try {
      const pending = dispatchAction('role.open', { id: 'level-designer' }, { source: 'ai' });
      await requestStarted;
      useShellStore.setState({ activeSid: 'session-b', currentSessionId: 'session-b' });
      releaseRoster();

      await expect(pending).resolves.toEqual({
        status: 'completed',
        stateDigest: { opened: 'level-designer', boundSid: 'session-a', activeWorkspace: 'ai' },
      });
      expect(useShellStore.getState().tabs.find((entry) => entry.sid === 'session-a')?.agentId).toBe('level-designer');
      expect(useShellStore.getState().tabs.find((entry) => entry.sid === 'session-b')?.agentId).toBeNull();
    } finally {
      await removePage();
      await control.dispose();
    }
  });

  test('role.open 等待期间目标会话被关闭时明确拒绝', async () => {
    const owner = '@forgeax/studio-agents';
    const pageId = qualifyContributionId(owner, 'page', 'workspace');
    const panelId = qualifyContributionId(owner, 'panel', 'main');
    const { control } = createAppHost();
    const removePage = control.contributePagePlatform(owner, {
      panelTypes: [{ id: panelId, runtime: { kind: 'inline', render: () => null } }],
      pageTypes: [{
        id: pageId,
        title: 'Agents',
        cardinality: 'singleton',
        layout: { version: 1, root: { kind: 'tabs', placements: ['main'] } },
        panels: [{ id: 'main', panelTypeId: panelId }],
      }],
    });
    useShellStore.setState({
      tabs: [tab('session-a'), tab('session-b')],
      activeSid: 'session-a',
      currentSessionId: 'session-a',
      agentBySid: {},
    });
    let releaseRoster!: () => void;
    let markStarted!: () => void;
    const rosterGate = new Promise<void>((resolve) => { releaseRoster = resolve; });
    const requestStarted = new Promise<void>((resolve) => { markStarted = resolve; });
    globalThis.fetch = async () => {
      markStarted();
      await rosterGate;
      return new Response(JSON.stringify({ ok: true, result: { roles: [{ id: 'level-designer' }] } }));
    };

    try {
      const pending = dispatchAction('role.open', { id: 'level-designer' }, { source: 'ai' });
      await requestStarted;
      useShellStore.setState({
        tabs: [tab('session-b')],
        activeSid: 'session-b',
        currentSessionId: 'session-b',
      });
      releaseRoster();

      await expect(pending).resolves.toEqual({
        status: 'rejected',
        reason: 'role.open target session no longer exists',
      });
      expect(useShellStore.getState().tabs[0]?.agentId).toBeNull();
    } finally {
      await removePage();
      await control.dispose();
    }
  });

  test('overlay.open 拒绝未注册 id,不制造看似打开的状态', async () => {
    const { control } = createAppHost({ initialPanels: { overlays: { Settings: () => null } } });
    try {
      const result = await dispatchAction('overlay.open', { id: 'missing-overlay' }, { source: 'ai' });

      expect(result).toEqual({
        status: 'rejected',
        reason: 'overlay.open could not find registered overlay "missing-overlay"',
      });
      expect(useShellStore.getState().activeOverlay).toBeNull();
    } finally {
      await control.dispose();
    }
  });

  test('overlay.open 通过产品 overlay 注册表解析并回读最终状态', async () => {
    const { control } = createAppHost({ initialPanels: { overlays: { Settings: () => null } } });
    try {
      const result = await dispatchAction('overlay.open', { id: 'settings' }, { source: 'ai' });

      expect(result).toEqual({
        status: 'completed',
        stateDigest: { activeOverlay: 'settings' },
      });
      expect(useShellStore.getState().activeOverlay).toBe('settings');
    } finally {
      await control.dispose();
    }
  });

  test('session.close 删除失败时拒绝并保留本地 tab', async () => {
    configureSessionClient(sessionClient({
      deleteSession: async () => { throw new Error('disk unavailable'); },
    }));
    useShellStore.setState({
      tabs: [tab('session-a'), tab('session-b')],
      activeSid: 'session-a',
      currentSessionId: 'session-a',
    });

    const result = await dispatchAction('session.close', { sid: 'session-a' }, { source: 'ai' });

    expect(result).toEqual({
      status: 'rejected',
      reason: 'session.close could not delete session "session-a": disk unavailable',
      stateDigest: { code: 'SESSION_DELETE_FAILED', activeSid: 'session-a' },
    });
    expect(useShellStore.getState().tabs.map((entry) => entry.sid)).toEqual(['session-a', 'session-b']);
  });

  test('session.close 只在服务端删除成功后移除本地 tab', async () => {
    configureSessionClient(sessionClient());
    useShellStore.setState({
      tabs: [tab('session-a'), tab('session-b')],
      activeSid: 'session-a',
      currentSessionId: 'session-a',
    });

    const result = await dispatchAction('session.close', { sid: 'session-a' }, { source: 'ai' });

    expect(result).toEqual({
      status: 'completed',
      stateDigest: { deleted: true, activeSid: 'session-b' },
    });
    expect(useShellStore.getState().tabs.map((entry) => entry.sid)).toEqual(['session-b']);
  });

  test('session.close 服务端已删除但本地回读异常时披露部分成功并禁止重删', async () => {
    const originalCloseSession = useShellStore.getState().closeSession;
    useShellStore.setState({
      tabs: [tab('session-a'), tab('session-b')],
      activeSid: 'session-b',
      currentSessionId: 'session-b',
      closeSession: async () => ({ status: 'deleted', activeSid: 'session-b' }),
    });

    try {
      const result = await dispatchAction('session.close', { sid: 'session-a' }, { source: 'ai' });

      expect(result).toEqual({
        status: 'completed',
        stateDigest: {
          deleted: true,
          activeSid: 'session-b',
          localStateConsistent: false,
          warning: {
            code: 'SESSION_DELETE_READBACK_FAILED',
            message: 'Session "session-a" was deleted on the server but local state still contains it',
          },
          recovery: 'Refresh sessions before continuing. Do not retry the deletion.',
        },
      });
    } finally {
      useShellStore.setState({ closeSession: originalCloseSession });
    }
  });

  test('session.close 删除成功但替代会话创建失败时披露部分成功并禁止重删', async () => {
    configureSessionClient(sessionClient({
      createSession: async () => { throw new Error('replacement unavailable'); },
    }));
    useShellStore.setState({
      tabs: [tab('session-a')],
      activeSid: 'session-a',
      currentSessionId: 'session-a',
    });

    const result = await dispatchAction('session.close', { sid: 'session-a' }, { source: 'ai' });

    expect(result).toEqual({
      status: 'completed',
      stateDigest: {
        deleted: true,
        activeSid: null,
        replacementReady: false,
        warning: { code: 'SESSION_REPLACEMENT_FAILED', message: 'replacement unavailable' },
        recovery: 'Create or refresh a session before continuing chat work. Do not retry the deletion.',
      },
    });
    expect(useShellStore.getState().tabs).toEqual([]);
  });

  test('session.rename 在没有持久化能力时明确拒绝,不临时改标签', async () => {
    useShellStore.setState({
      tabs: [tab('session-a', 'Original')],
      activeSid: 'session-a',
      currentSessionId: 'session-a',
    });

    const result = await dispatchAction(
      'session.rename',
      { sid: 'session-a', displayName: 'Temporary lie' },
      { source: 'ai' },
    );

    expect(result).toEqual({
      status: 'rejected',
      reason: 'Persistent session rename is not available in this Studio version',
    });
    expect(useShellStore.getState().tabs[0]?.displayName).toBe('Original');
  });

  test('sessions.refresh 服务端读取失败时明确拒绝', async () => {
    configureSessionClient(sessionClient({
      fetchSessionList: async () => { throw new Error('server unavailable'); },
    }));
    useShellStore.setState({
      tabs: [tab('session-a')],
      activeSid: 'session-a',
      currentSessionId: 'session-a',
    });

    const result = await dispatchAction('sessions.refresh', {}, { source: 'ai' });

    expect(result).toEqual({
      status: 'rejected',
      reason: 'sessions.refresh could not read the server session list: server unavailable',
      stateDigest: { code: 'SESSION_LIST_FAILED' },
    });
    expect(useShellStore.getState().tabs.map((entry) => entry.sid)).toEqual(['session-a']);
  });

  test('sessions.refresh 只在服务端列表成功回读后报告完成', async () => {
    configureSessionClient(sessionClient({
      fetchSessionList: async () => [{ sid: 'session-b', displayName: 'Fresh' }],
    }));
    useShellStore.setState({
      tabs: [tab('session-a')],
      activeSid: 'session-a',
      currentSessionId: 'session-a',
    });

    const result = await dispatchAction('sessions.refresh', {}, { source: 'ai' });

    expect(result).toEqual({
      status: 'completed',
      stateDigest: { tabs: 1, serverCount: 1 },
    });
    expect(useShellStore.getState().tabs.map((entry) => entry.sid)).toEqual(['session-b']);
  });

  test('role.create description 不再重复承载 roster 查重顺序提示', () => {
    const roleCreate = buildManifest().find((row) => row.id === 'role.create');
    expect(roleCreate?.description).not.toContain('Discover existing roles first via role.list.');
  });
});
