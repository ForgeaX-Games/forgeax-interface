import { describe, expect, test } from 'bun:test';
import { applyStudioWindowTitle, formatStudioWindowTitle, resolveGameDisplayName } from './active-game-chrome';

describe('active game chrome projection', () => {
  test('falls back to slug when the display name is missing or blank', () => {
    expect(resolveGameDisplayName(null, [])).toBeNull();
    expect(resolveGameDisplayName('arena', [])).toBe('arena');
    expect(resolveGameDisplayName('arena', [{ slug: 'arena', name: '  ' }])).toBe('arena');
    expect(resolveGameDisplayName('arena', [{ slug: 'arena', name: 'Arena' }])).toBe('Arena');
  });

  test('window title is product-only until a game is open, then updates immediately', () => {
    expect(formatStudioWindowTitle('ForgeaX Studio', null)).toBe('ForgeaX Studio');
    expect(formatStudioWindowTitle('ForgeaX Studio', 'Arena')).toBe('ForgeaX Studio — Arena');
  });

  test('applyStudioWindowTitle writes document.title in the browser runtime', async () => {
    await applyStudioWindowTitle('ForgeaX Studio — Arena');
    expect(document.title).toBe('ForgeaX Studio — Arena');
    await applyStudioWindowTitle('ForgeaX Studio');
    expect(document.title).toBe('ForgeaX Studio');
  });
});
