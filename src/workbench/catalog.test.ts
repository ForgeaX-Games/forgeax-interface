import { describe, expect, test } from 'bun:test';
import {
  extensionSlug,
  loadWorkbenchCatalog,
  mergeWorkbenchCatalogSources,
  resolveWorkbenchGameId,
  sharedWorkbenchSelection,
  sharedWorkbenchSelectionExtensionId,
} from './catalog';

describe('shared workbench catalog', () => {
  test('resolves the active game and contains the catalog URL under the Host API', async () => {
    const urls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url === '/api/workbench/games') {
        return Response.json({ activeSlug: 'game-one' });
      }
      return Response.json({
        entries: [{
          extensionId: '@forgeax/wb-game-video',
          runtimeId: 'runtime-video',
          title: 'Video Game',
          runtimeUrl: 'extension/runtime-video/',
        }],
      });
    };

    const gameId = await resolveWorkbenchGameId(null, fetcher);
    expect(gameId).toBe('game-one');
    expect(await loadWorkbenchCatalog(gameId!, fetcher)).toEqual([
      expect.objectContaining({
        extensionId: '@forgeax/wb-game-video',
        runtimeUrl: '/__workbench__/v1/extension/runtime-video/',
      }),
    ]);
    expect(urls).toEqual([
      '/api/workbench/games',
      '/__workbench__/v1/catalog?gameId=game-one',
    ]);
  });

  test('maps package and legacy manifest ids to one product slug', () => {
    expect(extensionSlug('@forgeax/wb-game-video')).toBe('wb-game-video');
    expect(extensionSlug('@forgeax-extension/wb-game-video')).toBe('wb-game-video');
  });

  test('keeps Host-only extensions discoverable without a legacy bus manifest', () => {
    const sources = mergeWorkbenchCatalogSources(
      ['wb-game-video', 'wb-bgm'],
      [{ id: '@forgeax-extension/wb-bgm' }],
      (entry) => extensionSlug(entry.id),
      [{
        extensionId: '@forgeax/wb-game-video',
        runtimeId: 'runtime-video',
        title: 'Video Game',
        runtimeUrl: '/__workbench__/v1/extension/runtime-video/',
      }],
    );

    expect(sources).toEqual([
      expect.objectContaining({
        slug: 'wb-game-video',
        legacy: null,
        host: expect.objectContaining({ extensionId: '@forgeax/wb-game-video' }),
      }),
      expect.objectContaining({
        slug: 'wb-bgm',
        legacy: { id: '@forgeax-extension/wb-bgm' },
        host: null,
      }),
    ]);
  });

  test('keeps shared Host selection disjoint from legacy extension ids', () => {
    const selection = sharedWorkbenchSelection('@forgeax/wb-game-video');
    expect(selection).toBe('shared-workbench:@forgeax/wb-game-video');
    expect(sharedWorkbenchSelectionExtensionId(selection)).toBe('@forgeax/wb-game-video');
    expect(sharedWorkbenchSelectionExtensionId('@forgeax/wb-game-video')).toBeNull();
  });
});
