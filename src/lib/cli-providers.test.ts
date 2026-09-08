import { afterEach, describe, expect, test } from 'bun:test';
import { displayableKernelCapabilities, fetchCliProviders, pendingCliProviders } from './cli-providers';

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

describe('pending CLI catalog', () => {
  test('shows known providers without starting detection or claiming availability', () => {
    globalThis.fetch = (() => { throw new Error('catalog must be synchronous'); }) as typeof fetch;
    const rows = pendingCliProviders();
    expect(rows.find((p) => p.id === 'codex')?.displayName).toBe('OpenAI Codex');
    expect(rows.find((p) => p.id === 'claude-code')?.displayName).toBe('the reference agent CLI');
    expect(rows.every((p) => p.health.pending && !p.health.ok)).toBe(true);
    expect(rows.every((p) => Object.keys(p.capabilities).length === 0)).toBe(true);
    rows[0].health.ok = true;
    expect(pendingCliProviders()[0].health.ok).toBe(false);
  });

  test('passes cancellation through to health detection', async () => {
    const controller = new AbortController();
    globalThis.fetch = (async (_url, options) => {
      expect(options?.signal).toBe(controller.signal);
      return new Response(JSON.stringify({ providers: [] }));
    }) as typeof fetch;
    await fetchCliProviders(false, controller.signal);
  });
});
