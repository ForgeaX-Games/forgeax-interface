import { describe, expect, test } from 'bun:test';
import { resolveSidebarActiveEntry } from './active-entry';

const entries = [
  { id: 'agents', label: 'Agents' },
  { id: 'wb:video', label: 'Video' },
];

describe('resolveSidebarActiveEntry', () => {
  test('does not show Agents while the selected plugin is still loading', () => {
    expect(resolveSidebarActiveEntry([entries[0]!], 'wb:video')).toBeUndefined();
  });

  test('resolves the selected entry once its manifest arrives', () => {
    expect(resolveSidebarActiveEntry(entries, 'wb:video')).toEqual(entries[1]);
  });

  test('does not resolve a legacy entry while the shared Host owns the surface', () => {
    expect(resolveSidebarActiveEntry(
      entries,
      'wb:video',
      'shared-workbench:@forgeax/wb-game-video',
    )).toBeUndefined();
  });
});
