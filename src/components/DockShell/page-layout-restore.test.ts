import { describe, expect, it } from 'bun:test';
import { hasMountedPanelPlacement, pruneSerializedDockLayout } from '@forgeax/app-shell/dock';

describe('Page layout restore acceptance', () => {
  it('rejects empty or unrelated restored layouts', () => {
    expect(hasMountedPanelPlacement(['content'], new Set())).toBe(false);
    expect(hasMountedPanelPlacement(['content'], new Set(['tools', 'main']))).toBe(false);
  });

  it('accepts a restore when at least one current Page placement survives', () => {
    expect(hasMountedPanelPlacement(['content', 'details'], new Set(['details']))).toBe(true);
  });

  it('strips foreign-region panels from a page layout before restore', () => {
    const layout = {
      grid: {
        root: {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['viewport'], activeView: 'viewport' }, size: 700 },
            { type: 'leaf', data: { views: ['chat'], activeView: 'chat' }, size: 300 },
          ],
          size: 1000,
        },
      },
      panels: {
        viewport: { id: 'viewport', contentComponent: 'ViewportPanel' },
        chat: { id: 'chat', contentComponent: 'ChatPanel' },
      },
    };

    const stripped = pruneSerializedDockLayout(
      layout as never,
      new Set(['ViewportPanel', 'ChatPanel']),
      new Set(['viewport']),
    ) as unknown as typeof layout;

    expect(Object.keys(stripped.panels)).toEqual(['viewport']);
    expect(JSON.stringify(stripped.grid)).not.toContain('chat');
  });
});
