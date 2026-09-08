import { describe, expect, test } from 'bun:test';
import { usesExternalIframeRuntime } from './extension-runtime-selection';

describe('ExtensionHostPanel runtime selection', () => {
  test('mounts host-projected dev frontend URLs as iframe runtimes', () => {
    expect(usesExternalIframeRuntime({ frontendUrl: 'http://127.0.0.1:5181/' })).toBe(true);
  });

  test('keeps native modules out of the legacy iframe path', () => {
    expect(usesExternalIframeRuntime({ runtimeMode: 'native-module' })).toBe(false);
  });

  test('keeps installed standalone and embedded placeholder modes distinct', () => {
    expect(usesExternalIframeRuntime({ entry: { standalone: {} } })).toBe(true);
    expect(usesExternalIframeRuntime({ entry: {} })).toBe(false);
  });
});
