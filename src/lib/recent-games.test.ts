import { afterEach, describe, expect, test } from 'bun:test';
import {
  getCachedGame,
  getRecentGames,
  getRecentGamesRevision,
  subscribeRecentGames,
  warmRecentGames,
} from './recent-games';
import {
  __resetStudioDomainClientsForTests,
  configureStudioDomainClients,
  type StudioProjectClient,
} from '../store-parts/domain-clients';

afterEach(() => {
  __resetStudioDomainClientsForTests();
});

describe('recent games cache', () => {
  test('notifies the menu after async games arrive and sorts by mtime', async () => {
    configureStudioDomainClients({
      agents: null as never,
      builds: null as never,
      projects: {
        listProjects: async () => ({
          games: [
            { slug: 'older', mtime: 10 },
            { slug: 'newer', mtime: 20 },
          ],
          activeSlug: null,
        }),
      } as StudioProjectClient,
    });

    const before = getRecentGamesRevision();
    let notifications = 0;
    const unsubscribe = subscribeRecentGames(() => { notifications += 1; });
    await warmRecentGames();
    await warmRecentGames();
    unsubscribe();

    expect(getRecentGamesRevision()).toBe(before + 1);
    expect(notifications).toBe(1);
    expect(getRecentGames().map((game) => game.slug)).toEqual(['newer', 'older']);
    expect(getCachedGame('newer')?.slug).toBe('newer');
    expect(getCachedGame('missing')).toBeUndefined();
  });
});
