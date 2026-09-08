import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('studio tab menu wiring', () => {
  it('binds getTabContextMenuItems through the provider and command surface', () => {
    const dockRegion = readFileSync(new URL('./DockRegion.tsx', import.meta.url), 'utf8');
    expect(dockRegion).toContain('createStudioTabContextMenuHandler');
    expect(dockRegion).toContain('createPanelTabCommands');
    expect(dockRegion).toContain('getTabContextMenuItems={getTabContextMenuItems}');
  });

  it('styles dockview tab menus under fx-dockwrap with Studio lime hover', () => {
    const css = readFileSync(new URL('./DockShell.css', import.meta.url), 'utf8');
    expect(css).toContain('--dv-context-menu-background-color');
    expect(css).toContain('.fx-dockwrap .dv-context-menu-item:not(.dv-context-menu-item--disabled):hover');
    expect(css).toContain('var(--color-brand-primary, #d4ff48) !important');
    expect(css).not.toContain('.studio-shell .dv-popover-anchor .dv-context-menu');
  });
});
