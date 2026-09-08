import { describe, expect, it } from 'bun:test';
import type { ExtensionInfo } from '../../lib/extension-api';
import {
  catalogExtensionItems,
  catalogPanelTypeRegistrations,
  createCatalogPageExtensionRuntime,
  extensionPane,
} from './catalog-page-extensions';

describe('catalogExtensionItems', () => {
  it('fails closed when a runtime response omits items', () => {
    expect(catalogExtensionItems({})).toEqual([]);
    expect(catalogExtensionItems(undefined)).toEqual([]);
  });

  it('preserves a validated extension list', () => {
    const items = [{ id: 'example' }];
    expect(catalogExtensionItems({ items })).toBe(items);
  });
});

describe('extensionPane', () => {
  it('only accepts runtime pane values carried by a Page placement', () => {
    expect(extensionPane({ pane: 'left' })).toBe('left');
    expect(extensionPane({ pane: 'center' })).toBe('center');
    expect(extensionPane({ pane: 'right' })).toBeUndefined();
    expect(extensionPane()).toBeUndefined();
  });
});

describe('catalog registry lifecycle', () => {
  const item = (frontendUrl?: string): ExtensionInfo => ({
    id: '@forgeax-extension/counter',
    version: '1.0.0',
    kind: 'extension',
    displayName: 'Counter',
    ...(frontendUrl ? { frontendUrl, runtimeMode: 'dev' as const } : { runtimeMode: 'embedded' as const }),
    contributes: {
      panelTypes: [{ id: 'counter.content', runtime: 'iframe', entry: './dist/index.html' }],
      pages: [{
        id: 'counter', title: 'Counter', cardinality: 'singleton', restorePolicy: 'project',
        layout: { version: 2, root: { kind: 'tabs', placements: ['content'], active: 'content' } },
        layoutVersion: 2,
        panels: [{ id: 'content', panelType: { extension: 'self', id: 'counter.content' } }],
      }],
      activities: [{ id: 'counter.launcher', title: 'Counter', pageType: { extension: 'self', id: 'counter' } }],
    },
  });

  it('registers and disposes Page, Panel, and Activity contributions as generation changes', async () => {
    const responses = [
      { kind: null, count: 1, generation: 1, items: [item('http://127.0.0.1:5173/')] },
      { kind: null, count: 0, generation: 2, items: [] },
    ];
    const events: string[] = [];
    const runtime = createCatalogPageExtensionRuntime({
      control: { contributePagePlatform(owner, contribution) {
        events.push(`add:${owner}:${contribution.pageTypes?.length}:${contribution.panelTypes?.length}:${contribution.activities?.length}`);
        return () => { events.push(`remove:${owner}`); };
      } },
      overriddenIds: new Set(),
      load: async () => responses.shift()!,
      pollIntervalMs: 0,
    });
    await runtime.refresh();
    await runtime.refresh();
    await runtime.dispose();
    expect(events).toEqual([
      'add:@forgeax-extension/counter:1:1:1',
      'remove:@forgeax-extension/counter',
    ]);
  });

  it('keeps unchanged contributions mounted when only registry generation changes', async () => {
    const first = { ...item(), registryGeneration: 6 };
    const second = { ...item(), registryGeneration: 7 };
    const responses = [
      { kind: null, count: 1, generation: 6, items: [first] },
      { kind: null, count: 1, generation: 7, items: [second] },
    ];
    const events: string[] = [];
    const runtime = createCatalogPageExtensionRuntime({
      control: { contributePagePlatform(owner) {
        events.push(`add:${owner}`);
        return () => { events.push(`remove:${owner}`); };
      } },
      overriddenIds: new Set(),
      load: async () => responses.shift()!,
      pollIntervalMs: 0,
    });
    await runtime.refresh();
    await runtime.refresh();
    expect(events).toEqual(['add:@forgeax-extension/counter']);
    await runtime.dispose();
    expect(events).toEqual([
      'add:@forgeax-extension/counter',
      'remove:@forgeax-extension/counter',
    ]);
  });

  it('replaces a dev shadow with the restored installed package at the next generation', async () => {
    const responses = [
      { kind: null, count: 1, generation: 4, items: [item('http://127.0.0.1:5173/')] },
      { kind: null, count: 1, generation: 5, items: [item()] },
    ];
    const events: string[] = [];
    const runtime = createCatalogPageExtensionRuntime({
      control: { contributePagePlatform(owner) {
        events.push(`add:${owner}`);
        return () => { events.push(`remove:${owner}`); };
      } },
      overriddenIds: new Set(),
      load: async () => responses.shift()!,
      pollIntervalMs: 0,
    });
    await runtime.refresh();
    await runtime.refresh();
    await runtime.dispose();
    expect(events).toEqual([
      'add:@forgeax-extension/counter',
      'remove:@forgeax-extension/counter',
      'add:@forgeax-extension/counter',
      'remove:@forgeax-extension/counter',
    ]);
  });

  it('isolates an invalid extension so later catalog contributions still register', async () => {
    const broken = { ...item(), id: '@forgeax-extension/broken' };
    const events: string[] = [];
    const runtime = createCatalogPageExtensionRuntime({
      control: { contributePagePlatform(owner) {
        if (owner === broken.id) throw new Error('invalid page contribution');
        events.push(`add:${owner}`);
        return () => { events.push(`remove:${owner}`); };
      } },
      overriddenIds: new Set(),
      load: async () => ({ kind: null, count: 2, generation: 1, items: [broken, item()] }),
      pollIntervalMs: 0,
      onError: (error, extensionId, phase) => {
        events.push(`error:${phase}:${extensionId}:${(error as Error).message}`);
      },
    });

    await runtime.refresh();
    await runtime.dispose();

    expect(events).toEqual([
      'error:register:@forgeax-extension/broken:invalid page contribution',
      'add:@forgeax-extension/counter',
      'remove:@forgeax-extension/counter',
    ]);
  });
});

describe('catalogPanelTypeRegistrations', () => {
  const base: ExtensionInfo = {
    id: '@demo/tool',
    version: '1.0.0',
    kind: 'extension',
    displayName: 'Demo Tool',
    contributes: {
      panelTypes: [{ id: 'main', runtime: 'inline' }],
    },
  };

  it('maps standalone extensions to a complete plugin window target', () => {
    const [panel] = catalogPanelTypeRegistrations({
      ...base,
      entry: { standalone: {} },
    });
    const createTarget = panel!.windowing!.createTarget;
    const target = createTarget({
      pageKey: {
        cardinality: 'singleton',
        typeId: '@demo/tool#page/main',
      },
      placementId: 'content',
      pageContext: {},
      initialProps: { pane: 'left' },
    } as Parameters<typeof createTarget>[0]);

    expect(target).toEqual({
      surface: {
        kind: 'plugin',
        id: '@demo/tool',
        pane: 'left',
        instance: 'page:v1:s:%40demo%2Ftool%23page%2Fmain::content',
      },
      title: 'Demo Tool',
      width: 960,
      height: 720,
      dockBehavior: 'keep-anchor',
    });
  });

  it('synthesizes panel types referenced by pages when panelTypes is omitted', () => {
    const panels = catalogPanelTypeRegistrations({
      id: '@forgeax-extension/video-game',
      version: '0.20.3',
      kind: 'extension',
      displayName: 'Video Game',
      runtimeMode: 'embedded',
      contributes: {
        pages: [{
          id: 'video-game',
          title: 'Video Game',
          cardinality: 'singleton',
          restorePolicy: 'project',
          layoutVersion: 1,
          layout: { version: 1, root: { kind: 'tabs', placements: ['content'], active: 'content' } },
          panels: [{ id: 'content', panelType: { extension: 'self', id: 'video-game.content' } }],
        }],
      },
    });
    expect(panels).toHaveLength(1);
    expect(panels[0]?.id).toBe('@forgeax-extension/video-game#panel/video-game.content');
  });

  it('does not declare windowing for embedded-only extensions', () => {
    const [panel] = catalogPanelTypeRegistrations(base);
    expect(panel?.windowing).toBeUndefined();
  });

  it('keeps Extension Host pages dock-only without a detached renderer', () => {
    for (const id of ['@forgeax-extension/video-game', '@forgeax-extension/game-video']) {
      const [panel] = catalogPanelTypeRegistrations({
        ...base,
        id,
        entry: { standalone: {} },
      });
      expect(panel?.windowing).toBeUndefined();
    }
  });
});
