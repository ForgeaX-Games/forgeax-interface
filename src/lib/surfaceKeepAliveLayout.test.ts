import { describe, expect, it } from 'bun:test';
import { clampOverlayRectBelowHeader, mapViewportRectToOverlayRoot } from './surfaceKeepAliveLayout';

describe('mapViewportRectToOverlayRoot', () => {
  it('subtracts overlay root viewport origin from anchor rect', () => {
    const root = {
      getBoundingClientRect: () => ({ top: 36, left: 0, width: 1200, height: 800 }),
    } as HTMLElement;
    const mapped = mapViewportRectToOverlayRoot(
      { top: 142, left: 48, width: 640, height: 360, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) },
      root,
    );
    expect(mapped).toEqual({ top: 106, left: 48, width: 640, height: 360 });
  });

  it('treats a missing overlay root as viewport origin', () => {
    const mapped = mapViewportRectToOverlayRoot(
      { top: 142, left: 48, width: 640, height: 360, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) },
      null,
    );
    expect(mapped).toEqual({ top: 142, left: 48, width: 640, height: 360 });
  });
});

describe('clampOverlayRectBelowHeader', () => {
  it('pushes the overlay below a WebView2-shifted header overlap', () => {
    const root = {
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }),
    } as HTMLElement;
    const header = { top: 0, left: 48, width: 640, height: 35, right: 688, bottom: 35, x: 48, y: 0, toJSON: () => ({}) };
    const clamped = clampOverlayRectBelowHeader(
      { top: 20, left: 48, width: 640, height: 360 },
      root,
      header,
    );
    expect(clamped).toEqual({ top: 35, left: 48, width: 640, height: 345 });
  });

  it('leaves a correctly parked overlay unchanged', () => {
    const root = {
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }),
    } as HTMLElement;
    const header = { top: 0, left: 48, width: 640, height: 35, right: 688, bottom: 35, x: 48, y: 0, toJSON: () => ({}) };
    const mapped = { top: 35, left: 48, width: 640, height: 360 };
    expect(clampOverlayRectBelowHeader(mapped, root, header)).toEqual(mapped);
  });
});
