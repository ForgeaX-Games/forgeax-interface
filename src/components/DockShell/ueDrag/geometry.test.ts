import { describe, expect, it } from 'bun:test';
import {
  directorLayout,
  hitDirector,
  outerTargets,
  hitOuter,
  previewRect,
  outerPreviewRect,
  pickGroup,
  pointInRect,
  stripInsertion,
  toGridDirection,
  UE_STRIP_SLOT_MIN,
  unionRect,
  type Rect,
} from './geometry';

const GROUP: Rect = { x: 100, y: 100, width: 400, height: 300 };

describe('directorLayout', () => {
  it('fills the content (inset by a margin) with a large center rectangle', () => {
    const layout = directorLayout(GROUP, 8);
    expect(layout.cx).toBe(300);
    expect(layout.cy).toBe(250);
    // Bounds fill the content minus the 8px margin on each side.
    expect(layout.bounds).toEqual({ x: 108, y: 108, width: 384, height: 284 });
    // Center rectangle sits strictly inside the filled bounds and is LARGE
    // (~46% of each side) so the four surrounding shapes read as trapezoids.
    expect(layout.center.x).toBeGreaterThan(layout.bounds.x);
    expect(layout.center.width).toBeLessThan(layout.bounds.width);
    expect(layout.center.width).toBeCloseTo(384 * 0.46, 5);
    expect(layout.center.height).toBeCloseTo(284 * 0.46, 5);
    // Trapezoids reach the content edges: top spans the full top edge.
    expect(layout.top[0]).toEqual({ x: 108, y: 108 });
    expect(layout.top[1]).toEqual({ x: 492, y: 108 });
    for (const poly of [layout.top, layout.bottom, layout.left, layout.right]) {
      expect(poly).toHaveLength(4);
    }
  });
  it('shrinks the margin for a tiny group so bounds stay positive', () => {
    const tiny: Rect = { x: 0, y: 0, width: 80, height: 60 };
    const layout = directorLayout(tiny);
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.bounds.height).toBeGreaterThan(0);
    expect(layout.center.width).toBeLessThanOrEqual(layout.bounds.width);
    expect(layout.center.height).toBeLessThanOrEqual(layout.bounds.height);
  });
});

describe('hitDirector', () => {
  const layout = directorLayout(GROUP);
  it('center square merges as tab', () => {
    expect(hitDirector(layout, { x: 300, y: 250 })).toBe('center');
  });
  it('ring splits along the group diagonals into trapezoids', () => {
    expect(hitDirector(layout, { x: 300, y: 130 })).toBe('top');
    expect(hitDirector(layout, { x: 300, y: 380 })).toBe('bottom');
    expect(hitDirector(layout, { x: 130, y: 250 })).toBe('left');
    expect(hitDirector(layout, { x: 470, y: 250 })).toBe('right');
  });
  it('returns null outside the group bounds', () => {
    expect(hitDirector(layout, { x: 50, y: 50 })).toBeNull();
  });
});

describe('outerTargets / hitOuter', () => {
  const wrap: Rect = { x: 0, y: 0, width: 1000, height: 600 };
  const targets = outerTargets(wrap);
  it('pins buttons inside each edge', () => {
    expect(hitOuter(targets, { x: 500, y: targets.top.y + 1 })).toBe('top');
    expect(hitOuter(targets, { x: 500, y: targets.bottom.y + 1 })).toBe('bottom');
    expect(hitOuter(targets, { x: targets.left.x + 1, y: 300 })).toBe('left');
    expect(hitOuter(targets, { x: targets.right.x + 1, y: 300 })).toBe('right');
  });
  it('returns null in the dead center', () => {
    expect(hitOuter(targets, { x: 500, y: 300 })).toBeNull();
  });
});

describe('previewRect', () => {
  it('edges take half the group, center takes all', () => {
    expect(previewRect(GROUP, 'left')).toEqual({ x: 100, y: 100, width: 200, height: 300 });
    expect(previewRect(GROUP, 'right')).toEqual({ x: 300, y: 100, width: 200, height: 300 });
    expect(previewRect(GROUP, 'top')).toEqual({ x: 100, y: 100, width: 400, height: 150 });
    expect(previewRect(GROUP, 'bottom')).toEqual({ x: 100, y: 250, width: 400, height: 150 });
    expect(previewRect(GROUP, 'center')).toEqual({ ...GROUP });
  });
});

describe('outerPreviewRect', () => {
  const wrap: Rect = { x: 0, y: 0, width: 900, height: 600 };
  it('reserves a third of the region on the chosen side', () => {
    expect(outerPreviewRect(wrap, 'left')).toEqual({ x: 0, y: 0, width: 300, height: 600 });
    expect(outerPreviewRect(wrap, 'right')).toEqual({ x: 600, y: 0, width: 300, height: 600 });
    expect(outerPreviewRect(wrap, 'top')).toEqual({ x: 0, y: 0, width: 900, height: 200 });
    expect(outerPreviewRect(wrap, 'bottom')).toEqual({ x: 0, y: 400, width: 900, height: 200 });
  });
});

describe('pickGroup', () => {
  it('prefers the smallest containing rect', () => {
    const big = { id: 'big', rect: { x: 0, y: 0, width: 1000, height: 1000 } };
    const small = { id: 'small', rect: { x: 100, y: 100, width: 200, height: 200 } };
    expect(pickGroup({ x: 150, y: 150 }, [big, small])?.id).toBe('small');
    expect(pickGroup({ x: 900, y: 900 }, [big, small])?.id).toBe('big');
    expect(pickGroup({ x: 2000, y: 2000 }, [big, small])).toBeNull();
  });
});

describe('stripInsertion', () => {
  // A horizontal footer strip: three 120px tabs starting at x=0, y=580..610.
  const STRIP: Rect = { x: 0, y: 580, width: 600, height: 30 };
  const TABS: Rect[] = [0, 120, 240].map((x) => ({ x, y: 580, width: 120, height: 30 }));

  it('picks the slot by tab midpoints, so a slide along the strip reorders', () => {
    expect(stripInsertion(TABS, STRIP, { x: 10, y: 595 }, 'x').index).toBe(0);
    expect(stripInsertion(TABS, STRIP, { x: 59, y: 595 }, 'x').index).toBe(0);
    expect(stripInsertion(TABS, STRIP, { x: 61, y: 595 }, 'x').index).toBe(1);
    expect(stripInsertion(TABS, STRIP, { x: 181, y: 595 }, 'x').index).toBe(2);
    expect(stripInsertion(TABS, STRIP, { x: 400, y: 595 }, 'x').index).toBe(3);
  });

  it('places the slot at the chosen boundary, sized like its neighbours', () => {
    expect(stripInsertion(TABS, STRIP, { x: 61, y: 595 }, 'x').slot)
      .toEqual({ x: 120, y: 580, width: 120, height: 30 });
    // Past the last midpoint the slot appends after the final tab.
    expect(stripInsertion(TABS, STRIP, { x: 400, y: 595 }, 'x').slot)
      .toEqual({ x: 360, y: 580, width: 120, height: 30 });
  });

  it('falls back to the minimum slot on an empty strip', () => {
    expect(stripInsertion([], STRIP, { x: 300, y: 595 }, 'x'))
      .toEqual({ index: 0, slot: { x: 0, y: 580, width: UE_STRIP_SLOT_MIN, height: 30 } });
  });

  it('runs along y for the vertical left/right edge strips', () => {
    const strip: Rect = { x: 0, y: 100, width: 40, height: 500 };
    const tabs: Rect[] = [100, 210].map((y) => ({ x: 0, y, width: 40, height: 110 }));
    expect(stripInsertion(tabs, strip, { x: 20, y: 140 }, 'y').index).toBe(0);
    expect(stripInsertion(tabs, strip, { x: 20, y: 200 }, 'y')).toEqual({
      index: 1,
      slot: { x: 0, y: 210, width: 40, height: 110 },
    });
    expect(stripInsertion(tabs, strip, { x: 20, y: 400 }, 'y').index).toBe(2);
  });
});

describe('unionRect', () => {
  it('covers both rects — a footer strip overflowing its host slot', () => {
    expect(unionRect({ x: 12, y: 693, width: 213, height: 27 }, { x: 12, y: 693, width: 625, height: 27 }))
      .toEqual({ x: 12, y: 693, width: 625, height: 27 });
    expect(unionRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 10, height: 20 }))
      .toEqual({ x: 0, y: 0, width: 30, height: 25 });
  });
});

describe('pointInRect / toGridDirection', () => {
  it('inclusive bounds', () => {
    expect(pointInRect({ x: 100, y: 100 }, GROUP)).toBe(true);
    expect(pointInRect({ x: 500, y: 400 }, GROUP)).toBe(true);
    expect(pointInRect({ x: 501, y: 400 }, GROUP)).toBe(false);
  });
  it('maps positions to grid directions', () => {
    expect(toGridDirection('top')).toBe('above');
    expect(toGridDirection('bottom')).toBe('below');
    expect(toGridDirection('left')).toBe('left');
    expect(toGridDirection('right')).toBe('right');
    expect(toGridDirection('center')).toBe('within');
  });
});
