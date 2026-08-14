import { afterEach, describe, expect, test } from 'bun:test';
import { displayableKernelCapabilities, fetchCliProviders } from './cli-providers';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('fetchCliProviders', () => {
  test('maps the DeepSeek Harness kernel to its product display name', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      providers: [{
        id: 'deepseek-harness',
        ok: true,
        detail: 'ready',
        capabilities: { streaming: false, sessions: true, jsonlReplay: false },
      }],
    }), { status: 200 })) as typeof fetch;

    const result = await fetchCliProviders();

    expect(result.providers).toEqual([{
      id: 'deepseek-harness',
      displayName: 'DeepSeek Harness',
      health: { ok: true, detail: 'ready' },
      capabilities: { streaming: false },
    }]);
  });

  test('does not present legacy sessions as native kernel resume capability', () => {
    expect(displayableKernelCapabilities({
      streaming: false,
      thinking: false,
      toolCalls: false,
      sessions: true,
      jsonlReplay: true,
    })).toEqual({ streaming: false, thinking: false, toolCalls: false });
  });
});
