import { describe, expect, it } from 'bun:test';
import { extensionPageMatches } from './page-navigation';

describe('extensionPageMatches', () => {
  it('matches canonical owner ids', () => {
    expect(
      extensionPageMatches('@forgeax-extension/gen3d', '@forgeax-extension/gen3d', 'gen3d'),
    ).toBe(true);
  });

  it('matches short slugs used by agents (gen3d)', () => {
    expect(extensionPageMatches('gen3d', '@forgeax-extension/gen3d', 'gen3d')).toBe(true);
  });

  it('matches page type id', () => {
    expect(extensionPageMatches('gen3d', '@forgeax-extension/gen3d', 'gen3d.content')).toBe(true);
  });

  it('rejects a different plugin', () => {
    expect(extensionPageMatches('gen3d', '@forgeax-extension/reel', 'reel')).toBe(false);
  });
});
