import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'bun:test';

const css = readFileSync(fileURLToPath(new URL('./SurfaceKeepAlive.css', import.meta.url)), 'utf8');

describe('keep-alive overlay vs viewport Play header', () => {
  it('does not let the overlay item steal clicks from the PanelShell Play row', () => {
    expect(css).toMatch(/\.fx-surface-keepalive-item\s*\{[^}]*pointer-events:\s*none/s);
    expect(css).toMatch(/\.fx-surface-keepalive-item \.ep-viewport-root[^}]*pointer-events:\s*auto/s);
  });

  it('clamps the overlay rect below the viewport header on desktop WebView2', () => {
    const layer = readFileSync(fileURLToPath(new URL('./SurfaceKeepAliveLayer.tsx', import.meta.url)), 'utf8');
    expect(layer).toContain('clampOverlayRectBelowHeader');
    expect(layer).toContain('data-dock-single-tab="hideTitle"');
  });
});
