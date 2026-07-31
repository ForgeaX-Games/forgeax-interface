import { describe, expect, test } from 'bun:test';
import { shouldHideToolsPanel } from './tools-panel-visibility';

describe('shouldHideToolsPanel', () => {
  test('hides the complete legacy tools panel while a shared Host owns the surface', () => {
    expect(shouldHideToolsPanel(
      false,
      'shared-workbench:@forgeax/wb-game-video',
    )).toBe(true);
  });

  test('preserves the existing collapse behavior for legacy selections', () => {
    expect(shouldHideToolsPanel(true, null)).toBe(true);
    expect(shouldHideToolsPanel(false, '@forgeax/wb-game-video')).toBe(false);
    expect(shouldHideToolsPanel(false, null)).toBe(false);
  });
});
