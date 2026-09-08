import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  EDGE_DRAWER_SURFACE_BLOCK_CLASS,
  isEdgeDrawerDismissExemptTarget,
  setEdgeDrawerSurfaceInteractionBlocked,
} from './edgeDrawer';

describe('edge drawer outside-pointer guard', () => {
  it('blocks the keep-alive surface while a drawer owns foreground interaction', () => {
    const classes = new Set<string>();
    const root = {
      classList: {
        toggle: (name: string, enabled?: boolean) => {
          if (enabled) classes.add(name);
          else classes.delete(name);
          return Boolean(enabled);
        },
      },
    } as unknown as HTMLElement;

    setEdgeDrawerSurfaceInteractionBlocked(root, true);
    expect(classes.has(EDGE_DRAWER_SURFACE_BLOCK_CLASS)).toBe(true);
    setEdgeDrawerSurfaceInteractionBlocked(root, false);
    expect(classes.has(EDGE_DRAWER_SURFACE_BLOCK_CLASS)).toBe(false);

    const css = readFileSync(new URL('./DockShell.css', import.meta.url), 'utf8');
    expect(css).toContain('.fx-edge-drawer-portal-host');
    expect(css).toContain(
      `html.${EDGE_DRAWER_SURFACE_BLOCK_CLASS} .fx-surface-keepalive-item`,
    );
  });

  it('keeps the drawer open for a portalled context-menu action', () => {
    const menuTarget = {
      closest: (selector: string) => selector.includes('.forgeax-ctx-menu-panel') ? menuTarget : null,
    } as unknown as Element;

    expect(isEdgeDrawerDismissExemptTarget(menuTarget)).toBe(true);
  });

  it("keeps the drawer open for dockview's own tab context menu", () => {
    const dvMenuTarget = {
      closest: (selector: string) => selector.includes('.dv-context-menu') ? dvMenuTarget : null,
    } as unknown as Element;

    expect(isEdgeDrawerDismissExemptTarget(dvMenuTarget)).toBe(true);
  });

  it('does not exempt an unrelated focused surface', () => {
    const otherSurface = {
      closest: () => null,
    } as unknown as Element;

    expect(isEdgeDrawerDismissExemptTarget(otherSurface)).toBe(false);
  });

  it('does not exempt a missing pointer target', () => {
    expect(isEdgeDrawerDismissExemptTarget(null)).toBe(false);
  });

  it('keeps the drawer open for an explicitly owned portal surface', () => {
    const ownedSurface = {
      closest: (selector: string) => selector.includes('[data-fx-interaction-scope]') ? ownedSurface : null,
    } as unknown as Element;

    expect(isEdgeDrawerDismissExemptTarget(ownedSurface)).toBe(true);
  });
});
