import { describe, expect, test } from 'bun:test';
import { deriveExtensionKindCounts, startResilientPoll } from './resilient-polling';

describe('startResilientPoll', () => {
  test('never overlaps an unresolved request', async () => {
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const stop = startResilientPoll(async () => {
      calls += 1;
      await pending;
    }, { intervalMs: 1, timeoutMs: 1_000, isVisible: () => true });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toBe(1);
    release();
    stop();
  });
});

describe('deriveExtensionKindCounts', () => {
  test('derives all status chips from one full extension list', () => {
    const result = deriveExtensionKindCounts([
      { id: 'model-a', kind: 'model-binding' },
      { id: 'skill-a', kind: 'skill' },
      { id: 'skill-b', kind: 'skill' },
      { id: 'tool-a', kind: 'tool' },
      { id: 'agent-a', kind: 'agent' },
    ]);

    expect(result).toEqual({
      'model-binding': { count: 1, ids: ['model-a'] },
      skill: { count: 2, ids: ['skill-a', 'skill-b'] },
      tool: { count: 1, ids: ['tool-a'] },
      agent: { count: 1, ids: ['agent-a'] },
    });
  });
});
