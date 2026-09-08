import { afterEach, describe, expect, test } from 'bun:test';
import { listGameTemplates } from './game-templates';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('listGameTemplates', () => {
  test('reads the project API template catalog', async () => {
    let requestedUrl = '';
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        templates: [
          { slug: 'game-default', name: 'Default' },
          { slug: '', name: 'Invalid' },
        ],
      }), { status: 200 });
    }) as typeof fetch;

    await expect(listGameTemplates()).resolves.toEqual([
      { slug: 'game-default', name: 'Default' },
    ]);
    expect(requestedUrl).toBe('/api/projects/templates');
  });
});
