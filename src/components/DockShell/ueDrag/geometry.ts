// Pure geometry for the Unreal-Engine-style dock drag overlay.
//
// UE's docking model is DISCRETE and uses a "dock director" widget painted at
// the center of the group under the cursor: a small center SQUARE surrounded by
// four TRAPEZOIDS (top/bottom/left/right) that tile the ring between the center
// square and the widget's outer square along its diagonals. The four trapezoids
// pick a split direction; the center square merges the panel in as a tab. On
// top of that, four "dock to the whole region" buttons sit at the region edges.
// The drop is decided by which SHAPE the cursor is over — not a free-form
// cursor-region heuristic. This module is the single source of truth for those
// shapes, their hit-testing, and the translucent preview slab.
//
// Everything here is framebuffer-agnostic (plain numbers), so it is exhaustively
// unit-testable without a DOM. The imperative overlay (overlay.ts) and the drag
// controller (controller.ts) consume these helpers; they own no geometry of
// their own.

/** dockview `Position` — identical set, reused so `moveTo({ position })` takes
 *  a UePosition directly without translation. */
export type UePosition = 'top' | 'bottom' | 'left' | 'right' | 'center';
/** Outer (dock-to-whole-region) targets have no center. */
export type UeOuterPosition = 'top' | 'bottom' | 'left' | 'right';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Director footprint tuning. Kept here (not in CSS) so hit-testing and
 *  rendering agree to the pixel — the overlay reads the SAME shapes it draws.
 *  The director fills the group's CONTENT area (tab strip excluded) as a large
 *  center rectangle framed by four shallow trapezoids — NOT corner-to-corner
 *  triangles. A large center is what keeps the four shapes trapezoidal. */
export const UE_DIRECTOR_MARGIN = 6; // inset from the content edges (px)
export const UE_DIRECTOR_CENTER_RATIO = 0.46; // center rectangle ÷ content side
export const UE_DIRECTOR_CENTER_MIN_W = 64;
export const UE_DIRECTOR_CENTER_MIN_H = 52;
export const UE_OUTER_BUTTON = 40;
export const UE_OUTER_MARGIN = 16;

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

function centeredSquare(cx: number, cy: number, size: number): Rect {
  return { x: cx - size / 2, y: cy - size / 2, width: size, height: size };
}

/** A trapezoid, as four viewport-space points (wide outer edge → narrow inner
 *  edge), ready to hand straight to an SVG `<polygon points>`. */
export type Polygon = readonly Point[];

export interface DirectorLayout {
  /** Widget center. */
  readonly cx: number;
  readonly cy: number;
  /** Filled bounds = the group inset by a small margin. */
  readonly bounds: Rect;
  /** Center square — merge the panel in as a tab. */
  readonly center: Rect;
  /** Directional trapezoids, wide edge on a group edge, narrow edge on the
   *  center square, split along the group's real (aspect-aware) diagonals. */
  readonly top: Polygon;
  readonly bottom: Polygon;
  readonly left: Polygon;
  readonly right: Polygon;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Build the dock director filling `content` (the group's content area, inset by
 *  a small margin): a LARGE center rectangle framed by four shallow trapezoids.
 *  Because the center is large, the surrounding shapes read as trapezoids rather
 *  than corner-reaching triangles. */
export function directorLayout(content: Rect, margin = UE_DIRECTOR_MARGIN): DirectorLayout {
  const m = Math.min(margin, content.width / 6, content.height / 6);
  const bx = content.x + m;
  const by = content.y + m;
  const bw = content.width - 2 * m;
  const bh = content.height - 2 * m;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const cW = clamp(bw * UE_DIRECTOR_CENTER_RATIO, Math.min(UE_DIRECTOR_CENTER_MIN_W, bw), bw);
  const cH = clamp(bh * UE_DIRECTOR_CENTER_RATIO, Math.min(UE_DIRECTOR_CENTER_MIN_H, bh), bh);
  const cwh = cW / 2;
  const chh = cH / 2;

  const oTL = { x: bx, y: by };
  const oTR = { x: bx + bw, y: by };
  const oBR = { x: bx + bw, y: by + bh };
  const oBL = { x: bx, y: by + bh };
  const cTL = { x: cx - cwh, y: cy - chh };
  const cTR = { x: cx + cwh, y: cy - chh };
  const cBR = { x: cx + cwh, y: cy + chh };
  const cBL = { x: cx - cwh, y: cy + chh };

  return {
    cx,
    cy,
    bounds: { x: bx, y: by, width: bw, height: bh },
    center: { x: cx - cwh, y: cy - chh, width: cW, height: cH },
    top: [oTL, oTR, cTR, cTL],
    right: [oTR, oBR, cBR, cTR],
    bottom: [oBR, oBL, cBL, cBR],
    left: [oBL, oTL, cTL, cBL],
  };
}

/** Which director shape (if any) the pointer is over. Center square wins; the
 *  surrounding ring is split along the group's real diagonals (aspect-aware, so
 *  the split lines actually hit the rectangle corners) into four trapezoids. */
export function hitDirector(layout: DirectorLayout, p: Point): UePosition | null {
  if (pointInRect(p, layout.center)) return 'center';
  if (!pointInRect(p, layout.bounds)) return null;
  const dx = (p.x - layout.cx) / (layout.bounds.width / 2);
  const dy = (p.y - layout.cy) / (layout.bounds.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}

export type OuterLayout = Readonly<Record<UeOuterPosition, Rect>>;

/** Four dock-to-whole-region buttons pinned just inside the region's edges. */
export function outerTargets(
  wrap: Rect,
  button = UE_OUTER_BUTTON,
  margin = UE_OUTER_MARGIN,
): OuterLayout {
  const cx = wrap.x + wrap.width / 2;
  const cy = wrap.y + wrap.height / 2;
  return {
    top: centeredSquare(cx, wrap.y + margin + button / 2, button),
    bottom: centeredSquare(cx, wrap.y + wrap.height - margin - button / 2, button),
    left: centeredSquare(wrap.x + margin + button / 2, cy, button),
    right: centeredSquare(wrap.x + wrap.width - margin - button / 2, cy, button),
  };
}

export function hitOuter(layout: OuterLayout, p: Point): UeOuterPosition | null {
  const order: readonly UeOuterPosition[] = ['top', 'bottom', 'left', 'right'];
  for (const pos of order) {
    if (pointInRect(p, layout[pos])) return pos;
  }
  return null;
}

/** The translucent preview rectangle for a group-relative drop. Edges take half
 *  the group along their axis; center covers the whole group. */
export function previewRect(group: Rect, pos: UePosition): Rect {
  const half = (n: number): number => n / 2;
  switch (pos) {
    case 'top':
      return { x: group.x, y: group.y, width: group.width, height: half(group.height) };
    case 'bottom':
      return { x: group.x, y: group.y + half(group.height), width: group.width, height: half(group.height) };
    case 'left':
      return { x: group.x, y: group.y, width: half(group.width), height: group.height };
    case 'right':
      return { x: group.x + half(group.width), y: group.y, width: half(group.width), height: group.height };
    case 'center':
    default:
      return { ...group };
  }
}

/** The preview rectangle for an outer (dock-to-whole-region) drop: a third of
 *  the region on the chosen side (UE reserves a slab, not a half, for the shell
 *  edge so the remaining layout stays legible). */
export function outerPreviewRect(wrap: Rect, pos: UeOuterPosition, ratio = 1 / 3): Rect {
  const slabW = wrap.width * ratio;
  const slabH = wrap.height * ratio;
  switch (pos) {
    case 'top':
      return { x: wrap.x, y: wrap.y, width: wrap.width, height: slabH };
    case 'bottom':
      return { x: wrap.x, y: wrap.y + wrap.height - slabH, width: wrap.width, height: slabH };
    case 'left':
      return { x: wrap.x, y: wrap.y, width: slabW, height: wrap.height };
    case 'right':
    default:
      return { x: wrap.x + wrap.width - slabW, y: wrap.y, width: slabW, height: wrap.height };
  }
}

/** Pick the innermost (smallest-area) group whose rect contains the point.
 *  dockview groups never truly nest, but tolerant selection keeps the choice
 *  stable when rects touch at shared sashes. */
export function pickGroup<T extends { readonly rect: Rect }>(p: Point, groups: readonly T[]): T | null {
  let best: T | null = null;
  let bestArea = Infinity;
  for (const g of groups) {
    if (!pointInRect(p, g.rect)) continue;
    const area = g.rect.width * g.rect.height;
    if (area < bestArea) {
      best = g;
      bestArea = area;
    }
  }
  return best;
}

/** Smallest rect covering both inputs. */
export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** A tab strip runs along one axis: 'x' for the horizontal grid/footer strips,
 *  'y' for the vertical left/right edge strips. */
export type StripAxis = 'x' | 'y';

export interface StripInsertion {
  /** Index the dropped panel takes among the strip's CURRENT tabs. */
  readonly index: number;
  /** Slot the incoming tab occupies — the ghost-tab preview footprint. */
  readonly slot: Rect;
}

/** Minimum slot length; matches the edge strip's `min-width/height: 104px`. */
export const UE_STRIP_SLOT_MIN = 104;

/** Where a tab dropped at `p` lands in a strip of existing tabs. The index is
 *  decided by tab MIDPOINTS along the strip axis, which is what makes a drag
 *  along the strip reorder continuously: once the slot opens between two tabs
 *  the cursor sits in that gap, and both neighbours' midpoints stay on their
 *  own side of it, so the choice is stable until the cursor passes the next
 *  midpoint. `tabs` must be in DOM order and exclude the slot itself. */
export function stripInsertion(
  tabs: readonly Rect[],
  strip: Rect,
  p: Point,
  axis: StripAxis,
  minSlot = UE_STRIP_SLOT_MIN,
): StripInsertion {
  const horiz = axis === 'x';
  const start = (r: Rect): number => (horiz ? r.x : r.y);
  const span = (r: Rect): number => (horiz ? r.width : r.height);
  const cursor = horiz ? p.x : p.y;

  let index = tabs.length;
  for (let i = 0; i < tabs.length; i += 1) {
    if (cursor < start(tabs[i]) + span(tabs[i]) / 2) {
      index = i;
      break;
    }
  }

  // Match the strip's rhythm: a median-sized slot reads as "one more tab".
  const lengths = tabs.map(span).sort((a, b) => a - b);
  const median = lengths.length > 0 ? lengths[Math.floor(lengths.length / 2)] : 0;
  const slotLen = Math.max(minSlot, median);

  const last = tabs[tabs.length - 1];
  const at = index < tabs.length
    ? start(tabs[index])
    : last
      ? start(last) + span(last)
      : start(strip);

  return {
    index,
    slot: horiz
      ? { x: at, y: strip.y, width: slotLen, height: strip.height }
      : { x: strip.x, y: at, width: strip.width, height: slotLen },
  };
}

/** Map a UePosition to the dockview grid `Direction` used by `addGroup`/
 *  `addPanel({ position })`. 'center' has no absolute direction. */
export function toGridDirection(pos: UePosition): 'above' | 'below' | 'left' | 'right' | 'within' {
  switch (pos) {
    case 'top': return 'above';
    case 'bottom': return 'below';
    case 'left': return 'left';
    case 'right': return 'right';
    case 'center':
    default: return 'within';
  }
}
