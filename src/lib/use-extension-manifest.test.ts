// manifestMatchesId accepts canonical identity only.
import { describe, expect, it } from 'bun:test';
import { manifestMatchesId } from './use-extension-manifest';
import type { ExtensionInfo } from './extension-api';

const m = {
  id: '@forgeax-extension/observatory',
} as unknown as ExtensionInfo;

describe('manifestMatchesId', () => {
  it('matches the canonical manifest id', () => {
    expect(manifestMatchesId(m, '@forgeax-extension/observatory')).toBe(true);
  });

  it('rejects a different extension', () => {
    expect(manifestMatchesId(m, '@forgeax-extension/reel')).toBe(false);
    expect(manifestMatchesId(m, 'observatory')).toBe(false);
    expect(manifestMatchesId(m, '@forgeax-plugin/reel')).toBe(false);
  });
});
