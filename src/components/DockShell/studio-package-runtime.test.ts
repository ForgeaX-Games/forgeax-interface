import { describe, expect, test } from 'bun:test';
import { usesExternalIframeRuntime } from './extension-runtime-selection';

describe('formal Studio package runtime selection', () => {
  test('mounts production package frontend entries through the iframe runtime', () => {
    expect(usesExternalIframeRuntime({
      runtimeMode: 'embedded',
      entry: { frontend: './dist/index.html' },
    })).toBe(true);
  });

  test('does not treat metadata-only extensions as iframe runtimes', () => {
    expect(usesExternalIframeRuntime({})).toBe(false);
  });
});
