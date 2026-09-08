// Unreal-Engine-style dock drag controller.
//
// Replaces dockview's native HTML5 tab drag (a floating chip + a single
// rectangular drop overlay, source panel stays put) with UE's model:
//
//   1. LIFT — on drag start the dragged panel is really removed from its grid
//      group (moved into a hidden floating group), so its former siblings
//      REFLOW immediately, exactly like UE. Because the move stays inside the
//      same dockview instance, dockview re-parents the panel's DOM instead of
//      re-mounting it: React state and live iframes/canvases are preserved (no
//      reload flicker).
//   2. AIM — a body-level overlay (overlay.ts) paints a five-button cross over
//      the group under the cursor plus four dock-to-region buttons at the
//      region edges, and a translucent slab previewing the landing area. Zone
//      selection is discrete (which BUTTON the cursor is over), like UE.
//   3. DROP — the panel is docked via `moveTo` (same instance) or re-created via
//      `addPanel` (cross instance), honouring the chosen position. ESC or a drop
//      with no active button restores the panel to where it was lifted from.
//
// Installed per DockRegion from `onReady` (like installEdgeDrawer); returns a
// disposer. A single module-level session guards against concurrent drags, and
// the shared overlay + `getDockRegions()` registry let a drag that begins in one
// region land in any other (DockShell / AuxBar / ChatDock).

import type { DockviewApi } from 'dockview';
import {
  getUeOverlay,
  type OverlayActive,
} from './overlay';
import { registerGlobalKeydownHandler } from '../../../lib/global-shortcuts';
import {
  directorLayout,
  hitDirector,
  previewRect,
  stripInsertion,
  toGridDirection,
  unionRect,
  type Point,
  type Rect,
  type StripAxis,
  type StripInsertion,
  type UeOuterPosition,
  type UePosition,
} from './geometry';
import { getDockRegions } from '../dockviewRegistry';

// ── Minimal structural view of the dockview API we consume ──────────────────
interface DvLocation {
  readonly type: 'grid' | 'floating' | 'popout' | 'edge';
  readonly position?: 'left' | 'right' | 'top' | 'bottom';
}
type EdgeSide = 'left' | 'right' | 'top' | 'bottom';
interface DvGroup {
  readonly id: string;
  readonly element: HTMLElement;
  readonly api: { readonly id: string; readonly location: DvLocation; collapse?(): void };
  readonly panels: readonly DvPanel[];
}
interface DvPanelApi {
  readonly location: DvLocation;
  readonly group: DvGroup;
  moveTo(o: { group?: DvGroup; position?: UePosition; index?: number }): void;
  close(): void;
  setActive(): void;
}
interface DvPanel {
  readonly id: string;
  readonly title?: string;
  readonly params?: Record<string, unknown>;
  readonly api: DvPanelApi;
  readonly group: DvGroup;
  readonly view?: { readonly contentComponent?: string };
}
interface DvApi {
  readonly id: string;
  readonly groups: readonly DvGroup[];
  getPanel(id: string): DvPanel | undefined;
  addFloatingGroup(item: DvPanel, options?: unknown): void;
  addGroup(options?: { direction?: 'above' | 'below' | 'left' | 'right' }): DvGroup;
  addPanel(options: {
    id: string;
    component: string;
    title?: string;
    params?: Record<string, unknown>;
    position?: { referenceGroup?: DvGroup; direction?: string };
  }): DvPanel;
  getEdgeGroup?(side: EdgeSide): { readonly id: string } | undefined;
  setEdgeGroupVisible?(side: EdgeSide, visible: boolean): void;
  layout?(width: number, height: number, force?: boolean): void;
}

export interface UeDragContext {
  readonly region: string;
  /** Persist the panel→region mapping (the existing `moveTo` store updater). */
  moveTo(panelId: string, region: string): void;
  /** Resolve a panel's display title for the ghost + re-created cross-instance panel. */
  titleFor(panelId: string): string | undefined;
  /** Pop the panel into a real independent window (the shell's existing
   *  openPanelWindow tear-off). Returns true if a pop-out was initiated; false
   *  (no capability / no carrier) lets the controller fall back. clientX/Y is the
   *  drop point in viewport coords. */
  popOut?(panelId: string, clientX: number, clientY: number): boolean;
}

const DRAG_THRESHOLD = 5;
const OUTER_DRAG_CLASS = 'fx-ue-dragging';
/** Added while the CHAT panel is being dragged: collapses its fixed shell column
 *  (see DockShell.css) so the layout reflows like lifting any grid panel (UE). */
const CHAT_DRAG_CLASS = 'fx-ue-dragging-chat';

type RegionEntry = { region: string; api: DvApi; wrapEl: HTMLElement };

interface Origin {
  api: DvApi;
  groupId: string;
  index: number;
  component: string;
  title: string | undefined;
  params: Record<string, unknown> | undefined;
}

interface Target {
  region: string;
  api: DvApi;
  /** Director / dock-to-region shape under the cursor. Null for strip targets
   *  ('tab' | 'edge'), whose hint is the ghost tab slot, not a director shape. */
  active: OverlayActive | null;
  group: DvGroup | null;
  /** How the drop resolves: directional split, merge into a group's tab strip,
   *  dock into an edge/footer strip, pop out into an independent floating
   *  window (center rectangle), or dock to a whole region edge. */
  mode: 'split' | 'tab' | 'pop' | 'edge' | 'outer';
  /** For 'tab' | 'edge': the slot the panel takes in the target strip. */
  index?: number;
  /** For mode 'edge': which edge/footer side to dock into. */
  edgeSide?: EdgeSide;
}

interface Session {
  sourceApi: DvApi;
  sourceRegion: string;
  panel: DvPanel;
  panelId: string;
  ghostTitle: string;
  origin: Origin;
  liftedGroupEl: HTMLElement | null;
  /** Where the lifted carrier lived before we parked it in the body overlay. */
  parkedParent: Node | null;
  parkedNext: Node | null;
  /** True once we wrote preview positioning onto the carrier (so endSession only
   *  clears styles we added, never dockview's own float bounds). */
  styledForPreview: boolean;
  /** The source region's drag context (for popOut on a center/pop drop). */
  ctx: UeDragContext;
  /** Last pointer position (viewport coords) — the pop-out anchor. */
  lastPoint: Point;
  target: Target | null;
  cleanups: Array<() => void>;
}

let session: Session | null = null;

/** True while a UE drag is in flight — DockRegion uses this to suppress
 *  dockview's own drop overlay (`onWillShowOverlay`) so the two never stack. */
export function isUeDragging(): boolean {
  return session !== null;
}

function regionEntries(): RegionEntry[] {
  const out: RegionEntry[] = [];
  for (const e of getDockRegions()) {
    if (!(e.wrapEl instanceof HTMLElement)) continue;
    out.push({ region: e.region, api: e.api as DvApi, wrapEl: e.wrapEl });
  }
  return out;
}

function rectOf(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/** UE-style LIVE preview: rather than hiding the lifted panel, show its REAL DOM
 *  over the predicted landing rect (translucent, non-interactive). Because the
 *  lift only re-parents the panel into a floating group, this shows the panel's
 *  actual render — with NO grid relayout (the layout only changes on drop).
 *
 *  We park the lifted carrier in the BODY-LEVEL overlay host so it clears every
 *  in-app stacking layer — critically the viewport keep-alive surface (fixed,
 *  z 40) that otherwise occludes an in-instance float — and so a single preview
 *  works across all dockview instances. Positioned in viewport coordinates
 *  (the host is fixed inset:0). Hidden when there's no target. */
function placeLiftedPreview(rect: Rect | null): void {
  const s = session;
  const el = s?.liftedGroupEl;
  if (!s || !el) return;
  if (!rect) {
    el.classList.add('fx-ue-lifted--hidden');
    return;
  }
  if (!s.parkedParent) {
    s.parkedParent = el.parentNode;
    s.parkedNext = el.nextSibling;
    getUeOverlay().livePreviewHost().appendChild(el);
  }
  el.classList.remove('fx-ue-lifted--hidden');
  s.styledForPreview = true;
  const st = el.style;
  st.position = 'fixed';
  st.left = `${rect.x}px`;
  st.top = `${rect.y}px`;
  st.right = 'auto';
  st.bottom = 'auto';
  st.width = `${rect.width}px`;
  st.height = `${rect.height}px`;
}

/** Return the lifted carrier to its original DOM slot so dockview's own DOM
 *  operations (moveTo / removeGroup) run against the tree it expects. */
function restoreLiftedDom(s: Session): void {
  const el = s.liftedGroupEl;
  if (!el || !s.parkedParent) return;
  try { s.parkedParent.insertBefore(el, s.parkedNext); } catch { /* noop */ }
  s.parkedParent = null;
  s.parkedNext = null;
}

function outerToDirection(pos: UeOuterPosition): 'above' | 'below' | 'left' | 'right' {
  switch (pos) {
    case 'top': return 'above';
    case 'bottom': return 'below';
    case 'left': return 'left';
    case 'right': return 'right';
  }
}

/** Find a group by id in an api (post-lift the origin group may be gone). */
function findGroup(api: DvApi, groupId: string): DvGroup | null {
  return api.groups.find((g) => g.id === groupId) ?? null;
}

function firstGridGroup(api: DvApi): DvGroup | null {
  return api.groups.find((g) => g.api.location.type === 'grid') ?? null;
}

// ── Session lifecycle ───────────────────────────────────────────────────────

function beginDrag(sourceApi: DvApi, panel: DvPanel, ctx: UeDragContext): void {
  const origin: Origin = {
    api: sourceApi,
    groupId: panel.group.id,
    index: Math.max(0, panel.group.panels.indexOf(panel)),
    component: panel.view?.contentComponent ?? panel.id,
    title: ctx.titleFor(panel.id) ?? panel.title,
    params: panel.params,
  };

  document.documentElement.classList.add(OUTER_DRAG_CLASS);
  // Chat lives in a fixed shell column (ChatDock), not the grid — so lifting it
  // does NOT reflow anything by itself. Collapse the column for the duration of
  // the drag so it reflows away UE-style; endSession removes the marker.
  if (panel.id === 'chat') document.documentElement.classList.add(CHAT_DRAG_CLASS);

  // Dragging a footer/edge panel: collapse its drawer flyout first, so the panel
  // tears off from a tidy strip (not a half-open drawer).
  if (panel.group.api.location.type === 'edge') {
    try { window.dispatchEvent(new CustomEvent('forgeax:edge-drawer', { detail: { action: 'close' } })); } catch { /* noop */ }
  }

  // LIFT: move the panel into a floating group so the grid reflows. Same-instance
  // move → DOM re-parent (state preserved: live iframes/canvases survive). The
  // floating CARRIER (its resize-container) starts hidden — no default-position
  // flash — then updateDrag repositions it over the predicted landing rect as a
  // live, translucent preview (or keeps it hidden when there's no target).
  let liftedGroupEl: HTMLElement | null = null;
  try {
    sourceApi.addFloatingGroup(panel);
    const fg = sourceApi.groups.find(
      (g) => g.api.location.type === 'floating' && g.panels.some((pp) => pp.id === panel.id),
    );
    const el = fg?.element ?? panel.group.element ?? null;
    liftedGroupEl = (el?.closest('.dv-resize-container') as HTMLElement | null) ?? el;
    liftedGroupEl?.classList.add('fx-ue-lifted', 'fx-ue-lifted--hidden');
  } catch { /* lift failed — fall back to a non-reflowing drag (panel stays) */ }

  session = {
    sourceApi,
    sourceRegion: ctx.region,
    panel,
    panelId: panel.id,
    ghostTitle: origin.title ?? panel.id,
    origin,
    liftedGroupEl,
    parkedParent: null,
    parkedNext: null,
    styledForPreview: false,
    ctx,
    lastPoint: { x: 0, y: 0 },
    target: null,
    cleanups: [],
  };
}

interface HoverHit {
  entry: RegionEntry;
  group: DvGroup;
  /** Whole group rect (tab strip + content). */
  groupRect: Rect;
  /** Content area rect (tab strip excluded) — where the director is drawn. */
  contentRect: Rect;
  /** True when the cursor is over the group's tab strip. */
  onTabs: boolean;
}

/** Resolve the dockview grid group under the cursor from live geometry. During a
 *  drag, panel content can be returned by elementFromPoint without a
 *  `.dv-groupview` ancestor (notably after the lifted carrier is re-parented),
 *  so DOM ancestry is not a reliable group boundary. The group rectangles are
 *  dockview's layout truth and also handle transparent viewport surfaces. */
function groupFromPoint(p: Point, isChat: boolean): HoverHit | null {
  const el = document.elementFromPoint(p.x, p.y);
  const domOnTabs = !!(el && (el as Element).closest('.dv-tabs-and-actions-container'));
  let best: HoverHit | null = null;
  let bestArea = Infinity;
  for (const entry of regionEntries()) {
    if (entry.region === 'ChatDock' && !isChat) continue;
    for (const g of entry.api.groups) {
      if (g.api.location.type !== 'grid') continue;
      const groupRect = rectOf(g.element);
      if (!groupRect
        || p.x < groupRect.x || p.x > groupRect.x + groupRect.width
        || p.y < groupRect.y || p.y > groupRect.y + groupRect.height) continue;
      const contentEl = g.element.querySelector('.dv-content-container') as HTMLElement | null;
      const contentRect = (contentEl && rectOf(contentEl)) || groupRect;
      const tabsRect = rectOf(g.element.querySelector('.dv-tabs-and-actions-container'));
      const onTabs = domOnTabs || !!(tabsRect
        && p.x >= tabsRect.x && p.x <= tabsRect.x + tabsRect.width
        && p.y >= tabsRect.y && p.y <= tabsRect.y + tabsRect.height);
      const area = groupRect.width * groupRect.height;
      if (area < bestArea) {
        bestArea = area;
        best = { entry, group: g, groupRect, contentRect, onTabs };
      }
    }
  }
  return best;
}

// ── Tab strips (grid headers + edge/footer drawers) ─────────────────────────
// A strip drop is a TAB drop: it has a slot, not a direction. Both the edge
// strips (left / right / footer) and a grid group's own tab header resolve to
// the same StripHit, so both preview the landing tab and reorder live.

const EDGE_SIDES: readonly EdgeSide[] = ['bottom', 'left', 'right', 'top'];
/** Arm a strip target just before the cursor reaches it. */
const STRIP_SLACK = 12;
/** Stand-in band along a region edge for a HIDDEN (empty) edge strip, so the
 *  last tab dragged out of a strip can always be dropped back in. */
const EMPTY_EDGE_BAND = 18;

interface StripHit {
  region: string;
  api: DvApi;
  group: DvGroup;
  /** Element whose direct `.dv-tab` children form the strip — the slot host.
   *  Null for an empty edge's stand-in band (no strip to reorder). */
  tabsEl: HTMLElement | null;
  axis: StripAxis;
  rect: Rect;
  insertion: StripInsertion;
  /** Set for edge/footer strips; absent for a grid group's own tab header. */
  side?: EdgeSide;
}

function pointNearRect(p: Point, r: Rect, slack: number): boolean {
  return p.x >= r.x - slack && p.x <= r.x + r.width + slack
    && p.y >= r.y - slack && p.y <= r.y + r.height + slack;
}

/** Live `.dv-tab` elements of a strip, in DOM order. Our ghost slot carries its
 *  own class, so it is never mistaken for a real tab. */
function tabElements(tabsEl: HTMLElement): HTMLElement[] {
  return Array.from(tabsEl.querySelectorAll<HTMLElement>(':scope > .dv-tab'));
}

function stripHit(
  entry: RegionEntry,
  group: DvGroup,
  host: HTMLElement | null,
  rect: Rect,
  axis: StripAxis,
  p: Point,
  side?: EdgeSide,
): StripHit {
  const tabsEl = host?.querySelector<HTMLElement>('.dv-tabs-container') ?? null;
  const tabs = tabsEl ? tabElements(tabsEl).map(rectOf).filter((r): r is Rect => r !== null) : [];
  return {
    region: entry.region,
    api: entry.api,
    group,
    tabsEl,
    axis,
    rect,
    insertion: stripInsertion(tabs, rect, p, axis),
    side,
  };
}

/** Resolve the region + group that owns a given edge (footer / side) drawer. */
function resolveEdge(side: EdgeSide): { entry: RegionEntry; group: DvGroup } | null {
  for (const entry of regionEntries()) {
    const eg = entry.api.getEdgeGroup?.(side);
    if (!eg) continue;
    const group = entry.api.groups.find((g) => g.api.id === eg.id);
    if (group) return { entry, group };
  }
  return null;
}

/** The element carrying an edge group's visible tabs. The BOTTOM strip is
 *  relocated into the StatusBar footer host, so its collapsed sliver in the
 *  grid is useless as a target; side strips stay in place. */
function edgeStripHost(side: EdgeSide, group: DvGroup): HTMLElement | null {
  if (side === 'bottom') return document.querySelector<HTMLElement>('[data-fx-dock-bottom-host]');
  return group.element.classList.contains('fx-edge-empty') ? null : group.element;
}

/** A strip's real footprint. The footer strip is a StatusBar slot its tabs can
 *  OVERFLOW, so neither the slot nor the tabs alone bound it: take the whole
 *  status row, which is what the user reads as "the footer strip" — a drop past
 *  the last tab then appends instead of missing the target. */
function stripBounds(host: HTMLElement): Rect | null {
  const parts = [
    rectOf(host),
    rectOf(host.querySelector<HTMLElement>('.dv-tabs-and-actions-container')),
    rectOf(host.closest<HTMLElement>('.global-status-bar')),
  ].filter((r): r is Rect => r !== null);
  return parts.length > 0 ? parts.reduce(unionRect) : null;
}

function edgeBand(wrap: Rect, side: EdgeSide): Rect {
  const t = EMPTY_EDGE_BAND;
  switch (side) {
    case 'left': return { x: wrap.x, y: wrap.y, width: t, height: wrap.height };
    case 'right': return { x: wrap.x + wrap.width - t, y: wrap.y, width: t, height: wrap.height };
    case 'top': return { x: wrap.x, y: wrap.y, width: wrap.width, height: t };
    case 'bottom': return { x: wrap.x, y: wrap.y + wrap.height - t, width: wrap.width, height: t };
  }
}

/** Edge/footer strip under the cursor, with the slot the drop would take. */
function edgeStripHit(p: Point): StripHit | null {
  for (const side of EDGE_SIDES) {
    const found = resolveEdge(side);
    if (!found) continue;
    const { entry, group } = found;
    const host = edgeStripHost(side, group);
    const hostRect = host ? stripBounds(host) : null;
    const wrapRect = rectOf(entry.wrapEl);
    const rect = hostRect ?? (wrapRect ? edgeBand(wrapRect, side) : null);
    // Arm a real strip slightly early; the stand-in band gets no slack — it
    // already reaches into the grid, and widening it would swallow the tab
    // header of the group sitting against that edge.
    if (!rect || !pointNearRect(p, rect, hostRect ? STRIP_SLACK : 0)) continue;
    const axis: StripAxis = side === 'left' || side === 'right' ? 'y' : 'x';
    return stripHit(entry, group, hostRect ? host : null, rect, axis, p, side);
  }
  return null;
}

/** A grid group's own tab header, so merging as a tab picks a slot too. */
function gridStripHit(hovered: HoverHit, p: Point): StripHit | null {
  const host = hovered.group.element.querySelector<HTMLElement>(
    ':scope > .dv-tabs-and-actions-container',
  );
  const rect = host ? rectOf(host) : null;
  if (!host || !rect) return null;
  return stripHit(hovered.entry, hovered.group, host, rect, 'x', p);
}

// ── Ghost tab slot ──────────────────────────────────────────────────────────
// The landing hint for a strip drop is a real element inserted INTO the strip:
// the neighbouring tabs reflow around it, so dragging along the strip reorders
// continuously (UE) instead of just appending on drop. It is pointer-events
// none, so hit-testing (elementFromPoint) and the edge drawer never see it.

let slotEl: HTMLElement | null = null;

function syncTabSlot(hit: StripHit | null): void {
  const s = session;
  if (!s || !hit || !hit.tabsEl) {
    removeTabSlot();
    return;
  }
  if (!slotEl) {
    slotEl = document.createElement('div');
    slotEl.className = 'fx-ue-tab-slot';
  }
  const el = slotEl;
  el.textContent = s.ghostTitle;
  el.dataset.axis = hit.axis;
  const size = hit.axis === 'x' ? hit.insertion.slot.width : hit.insertion.slot.height;
  el.style.setProperty('--fx-ue-slot-size', `${size}px`);
  const ref = tabElements(hit.tabsEl)[hit.insertion.index] ?? null;
  // Re-insert only on a real slot change — an insertBefore every pointermove
  // would restart the CSS transition and flicker.
  if (el.parentElement !== hit.tabsEl || el.nextElementSibling !== ref) {
    hit.tabsEl.insertBefore(el, ref);
  }
}

function removeTabSlot(): void {
  try { slotEl?.remove(); } catch { /* noop */ }
}

function updateDrag(p: Point): void {
  if (!session) return;
  session.lastPoint = p;
  const isChat = session.panelId === 'chat';
  // Edge/footer strips win over the grid director: they only overlap the grid
  // by the arming slack, and their drop is a tab slot, not a split.
  const edge = edgeStripHit(p);

  let active: OverlayActive | null = null;
  let preview: Rect | null = null;
  let previewKind: 'slab' | 'strip' = 'slab';
  let target: Target | null = null;
  let strip: StripHit | null = edge;

  const hovered = edge ? null : groupFromPoint(p, isChat);
  const director = hovered ? directorLayout(hovered.contentRect) : null;

  if (edge) {
    // Dock into the edge/footer strip at the hovered slot. The director stays
    // out of it: an edge drop has no direction, only an order. An empty edge
    // has no strip to open a slot in, so its band is filled instead of framed.
    preview = edge.rect;
    previewKind = edge.tabsEl ? 'strip' : 'slab';
    target = {
      region: edge.region,
      api: edge.api,
      active: null,
      group: edge.group,
      mode: 'edge',
      edgeSide: edge.side,
      index: edge.insertion.index,
    };
  } else if (hovered && hovered.onTabs) {
    // Over a grid group's tab header → merge as a tab at the hovered slot.
    strip = gridStripHit(hovered, p);
    if (strip) {
      preview = strip.rect;
      previewKind = 'strip';
      target = {
        region: strip.region,
        api: strip.api,
        active: null,
        group: strip.group,
        mode: 'tab',
        index: strip.insertion.index,
      };
    }
  } else if (hovered && director) {
    // The director's center rectangle + four trapezoids pick the drop: center →
    // pop out into an independent window, trapezoid → directional split. Only a
    // split shows a landing preview (slab + live render).
    const pos: UePosition | null = hitDirector(director, p);
    if (pos) {
      active = { kind: 'group', pos };
      const mode: Target['mode'] = pos === 'center' ? 'pop' : 'split';
      preview = mode === 'split' ? previewRect(hovered.contentRect, pos) : null;
      target = { region: hovered.entry.region, api: hovered.entry.api, active, group: hovered.group, mode };
    }
  }

  session.target = target;
  // Reflow the target strip around the incoming tab so the drop is previewed
  // where it will actually land — and reorders as the cursor slides along.
  syncTabSlot(strip);
  // Float the lifted panel's real DOM over the predicted rect so the user
  // previews the actual render, UE-style. Only for a directional SPLIT — pop and
  // strip drops preview through the director / ghost slot instead. Body-level
  // host → works over any group in any instance, above the keep-alive surface.
  placeLiftedPreview(target?.mode === 'split' ? preview : null);
  getUeOverlay().update({
    pointer: p,
    director,
    outer: null,
    active,
    preview,
    previewKind,
    ghostTitle: session.ghostTitle,
  });
}

function commit(): void {
  const s = session;
  if (!s) return;
  const { panel, target, origin } = s;

  // Put the carrier back where dockview expects it, and take the ghost slot out
  // of the strip, before any moveTo/removeGroup runs against that DOM.
  restoreLiftedDom(s);
  removeTabSlot();

  try {
    if (target && target.mode === 'pop') {
      // Pop out into a REAL independent window via the shell's existing tear-off
      // (openPanelWindow). Restore the panel to its origin first so it's a normal
      // dock panel the pop-out can detach + close; if no pop-out capability
      // exists it simply stays docked (never lost).
      restoreToOrigin(s);
      s.ctx.popOut?.(s.panelId, s.lastPoint.x, s.lastPoint.y);
    } else if (target && target.mode === 'edge' && target.group && target.edgeSide) {
      // Edge/footer dock: merge into the edge group at the previewed slot and
      // re-collapse its drawer, mirroring the legacy onMoveToSide behaviour.
      if (target.api === s.sourceApi) {
        dockIntoEdge(panel, target.api, target.group, target.edgeSide, target.index);
      } else {
        relocateCrossInstance(s, target.api, { referenceGroup: target.group, direction: 'within' });
        try { target.api.setEdgeGroupVisible?.(target.edgeSide, true); } catch { /* noop */ }
      }
    } else if (target && target.mode === 'tab' && target.group) {
      if (target.api === s.sourceApi) {
        panel.api.moveTo({ group: target.group, position: 'center', index: target.index });
      } else {
        relocateCrossInstance(s, target.api, { referenceGroup: target.group, direction: 'within' });
      }
    } else if (target && target.active?.kind === 'group' && target.group) {
      if (target.api === s.sourceApi) {
        panel.api.moveTo({ group: target.group, position: target.active.pos });
      } else {
        relocateCrossInstance(s, target.api, {
          referenceGroup: target.group,
          direction: toGridDirection(target.active.pos),
        });
      }
    } else if (target && target.active?.kind === 'outer') {
      const dir = outerToDirection(target.active.pos as UeOuterPosition);
      if (target.api === s.sourceApi) {
        const g = target.api.addGroup({ direction: dir });
        panel.api.moveTo({ group: g, position: 'center' });
      } else {
        relocateCrossInstance(s, target.api, { direction: dir });
      }
    } else {
      // No active button → snap back to where it was lifted from.
      restoreToOrigin(s);
    }
  } catch {
    try { restoreToOrigin(s); } catch { /* give up quietly */ }
  }

  // Persist the panel→region mapping so the layout store agrees with the DOM.
  // A popped float stays owned by the source region. Use the SESSION's own
  // persist fn (region-agnostic) rather than a module-global last-installed one,
  // which went stale/null whenever a region (e.g. ChatDock) unmounted between
  // drags — the "再次拖动 chat 不落位" class of bug.
  void origin;
  const persistRegion = target && target.mode !== 'pop' ? target.region : s.sourceRegion;
  try { s.ctx.moveTo(s.panelId, persistRegion); } catch { /* noop */ }

  endSession();
}

/** Dock a panel into an edge/footer drawer group, mirroring the legacy
 *  onMoveToSide path (DockRegion): make the side visible, merge the panel in at
 *  the previewed slot, then re-collapse the drawer. Cross-instance edge docks
 *  re-create the panel on the target first. */
function dockIntoEdge(
  panel: DvPanel,
  api: DvApi,
  edgeGroup: DvGroup,
  side: EdgeSide,
  index?: number,
): void {
  try { api.setEdgeGroupVisible?.(side, true); } catch { /* noop */ }
  try { edgeGroup.element.classList.remove('fx-edge-empty'); } catch { /* noop */ }
  panel.api.moveTo({ group: edgeGroup, position: 'center', index });
  try { edgeGroup.api.collapse?.(); } catch { /* noop */ }
  try { panel.api.setActive(); } catch { /* noop */ }
}

function restoreToOrigin(s: Session): void {
  const { panel, origin } = s;
  const g = findGroup(origin.api, origin.groupId) ?? firstGridGroup(origin.api);
  if (g) {
    panel.api.moveTo({ group: g, position: 'center', index: origin.index });
    try { panel.api.setActive(); } catch { /* noop */ }
  }
  // If no grid group survives, the panel stays floating (un-hidden by endSession).
}

function relocateCrossInstance(
  s: Session,
  targetApi: DvApi,
  position: { referenceGroup?: DvGroup; direction?: string },
): void {
  const { origin, panelId } = s;
  // Remove from the source (currently the hidden floating carrier), then add a
  // fresh panel on the target — a cross-instance move is a re-mount by nature.
  try { s.panel.api.close(); } catch { /* already gone */ }
  targetApi.addPanel({
    id: panelId,
    component: origin.component,
    title: origin.title,
    params: origin.params,
    position,
  });
}

/** After a chat drag the ChatDock column was collapsed with `display:none` (see
 *  CHAT_DRAG_CLASS), so dockview couldn't measure it while hidden. When chat
 *  lands back in the column (ESC / drop-to-origin) it reappears at a stale size —
 *  the classic "half height" — until dockview relayouts against the now-visible
 *  container. Force that once on the next frame (same remedy as the F1 re-open
 *  path). No-op when the column isn't visible (chat stayed in the centre grid). */
function relayoutChatDock(): void {
  requestAnimationFrame(() => {
    for (const e of regionEntries()) {
      if (e.region !== 'ChatDock') continue;
      const w = e.wrapEl.clientWidth;
      const h = e.wrapEl.clientHeight;
      if (w > 0 && h > 0) { try { e.api.layout?.(w, h, true); } catch { /* noop */ } }
    }
  });
}

function endSession(): void {
  const s = session;
  session = null;
  document.documentElement.classList.remove(OUTER_DRAG_CLASS);
  document.documentElement.classList.remove(CHAT_DRAG_CLASS);
  if (s?.panelId === 'chat') relayoutChatDock();
  removeTabSlot();
  if (s) {
    try { restoreLiftedDom(s); } catch { /* noop */ }
    try { s.liftedGroupEl?.classList.remove('fx-ue-lifted', 'fx-ue-lifted--hidden'); } catch { /* noop */ }
    // Clear ONLY the preview positioning we wrote — never dockview's own float
    // bounds, which a popped-out window relies on to stay visible/placed.
    const st = s.styledForPreview ? s.liftedGroupEl?.style : null;
    if (st) { st.position = ''; st.left = ''; st.top = ''; st.right = ''; st.bottom = ''; st.width = ''; st.height = ''; }
  }
  getUeOverlay().hide();
  for (const c of s?.cleanups ?? []) { try { c(); } catch { /* noop */ } }
}

// ── Public install ──────────────────────────────────────────────────────────

/** Arm a pointer-based UE drag: track the threshold, then run beginDrag →
 *  updateDrag → commit. Shared by grid-tab and footer-tab sources. */
function armPointerDrag(
  api: DvApi,
  panel: DvPanel,
  startX: number,
  startY: number,
  ctx: UeDragContext,
): void {
  let started = false;
  let unregisterKeydown: (() => void) | undefined;
  const onMove = (me: PointerEvent): void => {
    const p = { x: me.clientX, y: me.clientY };
    if (!started) {
      if (Math.hypot(p.x - startX, p.y - startY) < DRAG_THRESHOLD) return;
      started = true;
      beginDrag(api, panel, ctx);
    }
    updateDrag(p);
  };
  const finish = (cancel: boolean): void => {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    unregisterKeydown?.();
    unregisterKeydown = undefined;
    window.removeEventListener('dragstart', onNativeDrag, true);
    if (!started) return; // a plain click — let dockview / edgeDrawer handle it
    if (cancel && session) session.target = null;
    commit();
  };
  const onUp = (): void => finish(false);
  const onKey = (ke: KeyboardEvent): void => {
    if (ke.key === 'Escape') { ke.preventDefault(); finish(true); }
  };
  // Suppress the browser's native HTML5 drag on the tab so it can't race our
  // pointer drag (dockview marks tabs draggable).
  const onNativeDrag = (de: DragEvent): void => {
    if ((de.target as Element | null)?.closest('.dv-tab')) de.preventDefault();
  };
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  unregisterKeydown = registerGlobalKeydownHandler((ke) => {
    if (ke.key !== 'Escape') return false;
    onKey(ke);
    return true;
  });
  window.addEventListener('dragstart', onNativeDrag, true);
}

/** Resolve the panel behind a `.dv-tab` by its DOM order within the tabs
 *  container (dockview keeps tab order == panel order per group). */
function panelForTab(group: DvGroup, tabEl: Element, tabsContainer: Element | null): DvPanel | undefined {
  const tabs = tabsContainer ? Array.from(tabsContainer.querySelectorAll(':scope > .dv-tab')) : [];
  const index = tabs.indexOf(tabEl);
  return index >= 0
    ? group.panels[index]
    : (group.panels.find((pp) => pp.api.group === group) ?? group.panels[0]);
}

export function installUeDockDrag(
  api: DvApi | DockviewApi,
  wrapEl: HTMLElement,
  ctx: UeDragContext,
): () => void {
  // Dockview's public API exposes richer panel implementations than this
  // controller consumes. Narrow it once at the boundary to the structural
  // drag contract used by both production Dockview and test doubles.
  const dragApi = api as DvApi;

  // Dockview starts its native HTML5 drag as soon as the pointer crosses its
  // threshold. Install this guard for the whole lifetime of the region, not
  // only after our pointer controller has started, otherwise the native path
  // can win the race and show Dockview's one-sided drop affordance instead of
  // the UE director.
  const preventNativeTabDrag = (e: DragEvent): void => {
    if ((e.target as Element | null)?.closest('.dv-tab')) e.preventDefault();
  };
  const pointerdown = (e: PointerEvent): void => {
    if (session) return;
    if (e.button !== 0) return;
    const target = e.target as Element | null;
    if (!target) return;
    // Only genuine tab drags — never the close (X) / pin / pop-out actions.
    const tabEl = target.closest('.dv-tab');
    if (!tabEl || !wrapEl.contains(tabEl)) return;
    if (target.closest('.dv-default-tab-action, .fx-dock-popout, .fx-edge-pin')) return;

    const group = dragApi.groups.find((g) => g.element.contains(tabEl as Node));
    if (!group || group.api.location.type === 'floating') return;
    const panel = panelForTab(group, tabEl, tabEl.parentElement);
    if (!panel) return;

    armPointerDrag(dragApi, panel, e.clientX, e.clientY, ctx);
  };

  // Footer SOURCE: the bottom strip's tabs are relocated OUT of the dockview shell
  // into the footer host (see edgeDrawer), so they never reach `wrapEl`'s handler
  // above. Only the region that owns the bottom edge (DockShell) installs this
  // document-level catcher, mapping a footer tab back to its edge-group panel and
  // starting the SAME UE drag — so footer → main dock uses the new behaviour.
  const footerPointerDown = (e: PointerEvent): void => {
    if (session) return;
    if (e.button !== 0) return;
    const target = e.target as Element | null;
    const tabEl = target?.closest('.dv-tab');
    if (!tabEl || !tabEl.closest('[data-fx-dock-bottom-host]')) return;
    if (target?.closest('.dv-default-tab-action, .fx-dock-popout, .fx-edge-pin')) return;
    const bottom = resolveEdge('bottom');
    if (!bottom) return;
    const panel = panelForTab(bottom.group, tabEl, tabEl.closest('.dv-tabs-container'));
    if (!panel) return;
    // A real drag re-parents the tab (leaving the strip), so edgeDrawer's own
    // click handler finds no group and no-ops — no drawer toggle to suppress.
    armPointerDrag(bottom.entry.api, panel, e.clientX, e.clientY, ctx);
  };
  const ownsFooter = ctx.region === 'DockShell';
  if (ownsFooter) document.addEventListener('pointerdown', footerPointerDown, true);

  document.addEventListener('dragstart', preventNativeTabDrag, true);
  wrapEl.addEventListener('pointerdown', pointerdown, true);

  return () => {
    wrapEl.removeEventListener('pointerdown', pointerdown, true);
    if (ownsFooter) document.removeEventListener('pointerdown', footerPointerDown, true);
    document.removeEventListener('dragstart', preventNativeTabDrag, true);
    // If this region is unmounting mid-drag, tear the session down safely.
    if (session && session.sourceApi === dragApi) {
      try { restoreToOrigin(session); } catch { /* noop */ }
      endSession();
    }
  };
}
