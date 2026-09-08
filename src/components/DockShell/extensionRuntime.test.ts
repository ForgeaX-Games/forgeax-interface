import { beforeEach, describe, expect, test } from 'bun:test';
import {
  invalidateExtensionCatalog,
  isExtensionHostExtension,
  loadSharedExtensionCatalog,
  loadExtensionCatalog,
} from './extensionRuntime';

describe('Extension catalog runtime', () => {
  beforeEach(() => invalidateExtensionCatalog());

  test('routes declared handshake extensions through the Host', () => {
    expect(isExtensionHostExtension('@forgeax-extension/video-game')).toBe(true);
    expect(isExtensionHostExtension('@forgeax-extension/game-video')).toBe(true);
    expect(isExtensionHostExtension('@forgeax-extension/reel')).toBe(false);
  });

  test('loads the catalog from the formal same-origin Host API', async () => {
    const urls: string[] = [];
    const entries = await loadExtensionCatalog('game/one', async (input) => {
      urls.push(String(input));
      return Response.json({
        entries: [{
          extensionId: '@forgeax-extension/video-game',
          runtimeId: 'runtime-video',
          title: 'Video Game Studio',
          runtimeUrl: 'extension/runtime-video/',
        }],
      });
    });

    expect(urls).toEqual(['/__extension__/v1/catalog?gameId=game%2Fone']);
    expect(entries).toEqual([expect.objectContaining({
      extensionId: '@forgeax-extension/video-game',
      runtimeUrl: '/__extension__/v1/extension/runtime-video/',
    })]);
  });

  test('deduplicates sibling Page panel catalog requests', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return Response.json({ entries: [] });
    };
    const left = loadSharedExtensionCatalog('game-one', fetcher);
    const center = loadSharedExtensionCatalog('game-one', fetcher);

    expect(left).toBe(center);
    await Promise.all([left, center]);
    expect(calls).toBe(1);
  });

  test('does not cache a failed Host request', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return calls === 1
        ? new Response('unavailable', { status: 503 })
        : Response.json({ entries: [] });
    };

    await expect(loadSharedExtensionCatalog('game-one', fetcher)).rejects.toThrow('503');
    await expect(loadSharedExtensionCatalog('game-one', fetcher)).resolves.toEqual([]);
    expect(calls).toBe(2);
  });
});
