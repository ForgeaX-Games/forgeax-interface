import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import { _resetModelCatalogCache, refreshAllModelCatalogs, useModelCatalog } from './useModelCatalog';

const restorers: (() => void)[] = [];
afterEach(() => {
  cleanup();
  for (const restore of restorers.splice(0)) restore();
  _resetModelCatalogCache();
});

describe('model catalog refresh', () => {
  it('requests a fresh upstream catalog for the picker refresh button', async () => {
    const requests: string[][] = [];
    const fetcher = spyOn(globalThis, 'fetch').mockImplementation((async (_url, init) => {
      const { args } = JSON.parse(String(init?.body));
      requests.push(args);
      const id = args[1] === '--refresh' ? 'gpt-5.6' : 'gpt-5.5';
      return Response.json({ result: { ok: true, data: { models: [{ id }] } } });
    }) as typeof fetch);
    restorers.push(() => fetcher.mockRestore());
    const hook = renderHook(() => useModelCatalog());
    await act(async () => {});
    expect(hook.result.current.models?.[0]?.id).toBe('gpt-5.5');
    await act(async () => { await hook.result.current.refresh(); });
    expect(requests).toEqual([[], ['', '--refresh']]);
    expect(hook.result.current.models?.[0]?.id).toBe('gpt-5.6');
  });

  it('fetches again after an old request completes when credentials changed in flight', async () => {
    let finishOld!: (response: Response) => void;
    let calls = 0;
    const fetcher = spyOn(globalThis, 'fetch').mockImplementation((async () => {
      calls++;
      if (calls === 1) return await new Promise<Response>((resolve) => { finishOld = resolve; });
      return Response.json({ result: { ok: true, data: { models: [{ id: 'gpt-5.6' }] } } });
    }) as typeof fetch);
    restorers.push(() => fetcher.mockRestore());
    const hook = renderHook(() => useModelCatalog());
    await act(async () => {
      const refreshed = refreshAllModelCatalogs();
      finishOld(Response.json({ result: { ok: true, data: { models: [{ id: 'old-key-model' }] } } }));
      await refreshed;
    });
    expect(calls).toBe(2);
    expect(hook.result.current.models?.[0]?.id).toBe('gpt-5.6');
  });
});
