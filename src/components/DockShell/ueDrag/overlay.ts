// Imperative, viewport-fixed overlay for the UE-style dock drag.
//
// WHY imperative + a module singleton (not a React component):
//   * The drag controller (controller.ts) is itself installed imperatively from
//     `DockRegion.onReady` (same lifecycle as `installEdgeDrawer`), so it has no
//     React render scope to hang an overlay off of.
//   * There are THREE DockRegion instances (DockShell / AuxBar / ChatDock). A
//     drag can start in one and land in another; a single body-level overlay in
//     viewport coordinates paints seamlessly across all of them.
//   * During a drag we update on every pointermove — bypassing React's commit
//     phase keeps it jank-free.
//
// The dock director (center square + four trapezoids) is drawn as SVG so the
// trapezoids and their highlight are trivial. The overlay is purely decorative
// (`pointer-events: none`); all hit-testing is done by the controller against
// the SAME shapes drawn here (see geometry.ts), so it never needs events.

import type { DirectorLayout, OuterLayout, Point, Rect, UePosition } from './geometry';
import './ueDrag.css';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface OverlayActive {
  readonly kind: 'group' | 'outer';
  readonly pos: UePosition;
}

export interface OverlayState {
  /** Cursor position in viewport coordinates (for the drag ghost). */
  readonly pointer: Point;
  /** Dock director for the hovered group, or null when over no group. */
  readonly director: DirectorLayout | null;
  /** Four dock-to-region buttons for the hovered region, or null. */
  readonly outer: OuterLayout | null;
  /** The shape currently under the cursor (drives highlight + preview). */
  readonly active: OverlayActive | null;
  /** Translucent slab showing where a drop would land. */
  readonly preview: Rect | null;
  /** How to paint `preview`. A tab-strip target draws an OUTLINE only: the real
   *  landing hint there is the ghost tab slot the controller inserts into the
   *  strip, which a filled slab (drawn above every app layer) would cover. */
  readonly previewKind?: 'slab' | 'strip';
  /** Drag ghost label (the panel title). */
  readonly ghostTitle: string | null;
}

type DirPos = 'top' | 'bottom' | 'left' | 'right';

interface OverlayDom {
  root: HTMLElement;
  liveHost: HTMLElement;
  preview: HTMLElement;
  svg: SVGSVGElement;
  dirGroup: SVGGElement;
  dirTrapezoids: Record<DirPos, SVGPolygonElement>;
  dirCenter: SVGRectElement;
  outerBox: HTMLElement;
  outerBtns: Record<DirPos, HTMLElement>;
  ghost: HTMLElement;
}

let dom: OverlayDom | null = null;

function placeRect(el: HTMLElement, r: Rect | null): void {
  if (!r) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.style.transform = `translate(${r.x}px, ${r.y}px)`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
}

function placeSquare(el: HTMLElement, r: Rect | null): void {
  if (!r) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
}

function pointsAttr(poly: readonly Point[]): string {
  return poly.map((p) => `${p.x},${p.y}`).join(' ');
}

function build(): OverlayDom {
  const root = document.createElement('div');
  root.className = 'fx-ue-overlay';

  // Host for the LIVE panel preview (the lifted floating carrier is re-parented
  // here during a drag). First child → stacks below the slab/director/ghost, so
  // the green tint + wireframe read on top of the real panel render. Living in
  // the body-level overlay (z 2147483000) lifts it above the viewport keep-alive
  // surface (z 40) and works across dockview instances.
  const liveHost = document.createElement('div');
  liveHost.className = 'fx-ue-live-host';
  root.appendChild(liveHost);

  const preview = document.createElement('div');
  preview.className = 'fx-ue-preview';
  preview.style.display = 'none';
  root.appendChild(preview);

  // The dock director is SVG (trapezoids). One viewport-sized svg, shapes drawn
  // directly in viewport coordinates.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'fx-ue-svg');
  const dirGroup = document.createElementNS(SVG_NS, 'g');
  dirGroup.setAttribute('class', 'fx-ue-director');
  dirGroup.style.display = 'none';

  const mkPoly = (cls: DirPos): SVGPolygonElement => {
    const p = document.createElementNS(SVG_NS, 'polygon');
    p.setAttribute('class', `fx-ue-dir-trap fx-ue-dir-trap--${cls}`);
    dirGroup.appendChild(p);
    return p;
  };
  const dirTrapezoids: Record<DirPos, SVGPolygonElement> = {
    top: mkPoly('top'),
    bottom: mkPoly('bottom'),
    left: mkPoly('left'),
    right: mkPoly('right'),
  };
  const dirCenter = document.createElementNS(SVG_NS, 'rect');
  dirCenter.setAttribute('class', 'fx-ue-dir-center');
  dirCenter.setAttribute('rx', '4');
  dirGroup.appendChild(dirCenter);

  svg.appendChild(dirGroup);
  root.appendChild(svg);

  // Dock-to-region buttons remain simple squares pinned at the edges.
  const outerBox = document.createElement('div');
  outerBox.className = 'fx-ue-outer';
  outerBox.style.display = 'none';
  const mkBtn = (cls: string): HTMLElement => {
    const b = document.createElement('div');
    b.className = `fx-ue-btn fx-ue-btn--outer ${cls}`;
    const glyph = document.createElement('span');
    glyph.className = 'fx-ue-btn-glyph';
    b.appendChild(glyph);
    return b;
  };
  const outerBtns: Record<DirPos, HTMLElement> = {
    top: mkBtn('fx-ue-btn--top'),
    bottom: mkBtn('fx-ue-btn--bottom'),
    left: mkBtn('fx-ue-btn--left'),
    right: mkBtn('fx-ue-btn--right'),
  };
  for (const b of Object.values(outerBtns)) outerBox.appendChild(b);
  root.appendChild(outerBox);

  const ghost = document.createElement('div');
  ghost.className = 'fx-ue-ghost';
  ghost.style.display = 'none';
  root.appendChild(ghost);

  document.body.appendChild(root);
  return {
    root,
    liveHost,
    preview,
    svg,
    dirGroup,
    dirTrapezoids,
    dirCenter,
    outerBox,
    outerBtns,
    ghost,
  };
}

function ensureDom(): OverlayDom {
  if (dom && document.body.contains(dom.root)) return dom;
  dom = build();
  return dom;
}

function setActiveEls(
  els: Record<string, Element>,
  activePos: string | null,
): void {
  for (const [pos, el] of Object.entries(els)) {
    el.classList.toggle('fx-ue-active', pos === activePos);
  }
}

export interface UeOverlayHandle {
  update(state: OverlayState): void;
  /** Body-level host for the live panel preview (see build()'s liveHost). */
  livePreviewHost(): HTMLElement;
  hide(): void;
  destroy(): void;
}

let handle: UeOverlayHandle | null = null;

export function getUeOverlay(): UeOverlayHandle {
  if (handle) return handle;
  handle = {
    update(state: OverlayState): void {
      const d = ensureDom();
      d.root.style.display = '';

      // Preview slab.
      placeRect(d.preview, state.preview);
      d.preview.classList.toggle('fx-ue-preview--strip', state.previewKind === 'strip');

      // Dock director (SVG trapezoids + center square).
      const dir = state.director;
      if (dir) {
        d.dirGroup.style.display = '';
        d.dirTrapezoids.top.setAttribute('points', pointsAttr(dir.top));
        d.dirTrapezoids.bottom.setAttribute('points', pointsAttr(dir.bottom));
        d.dirTrapezoids.left.setAttribute('points', pointsAttr(dir.left));
        d.dirTrapezoids.right.setAttribute('points', pointsAttr(dir.right));
        d.dirCenter.setAttribute('x', String(dir.center.x));
        d.dirCenter.setAttribute('y', String(dir.center.y));
        d.dirCenter.setAttribute('width', String(dir.center.width));
        d.dirCenter.setAttribute('height', String(dir.center.height));
        const activeDir = state.active?.kind === 'group' ? state.active.pos : null;
        setActiveEls(
          { ...d.dirTrapezoids, center: d.dirCenter },
          activeDir,
        );
      } else {
        d.dirGroup.style.display = 'none';
      }

      // Outer (dock-to-region) targets.
      if (state.outer) {
        d.outerBox.style.display = '';
        placeSquare(d.outerBtns.top, state.outer.top);
        placeSquare(d.outerBtns.bottom, state.outer.bottom);
        placeSquare(d.outerBtns.left, state.outer.left);
        placeSquare(d.outerBtns.right, state.outer.right);
        setActiveEls(
          d.outerBtns,
          state.active?.kind === 'outer' ? state.active.pos : null,
        );
      } else {
        d.outerBox.style.display = 'none';
      }

      // Ghost chip.
      if (state.ghostTitle) {
        d.ghost.style.display = '';
        d.ghost.textContent = state.ghostTitle;
        d.ghost.style.transform = `translate(${state.pointer.x + 14}px, ${state.pointer.y + 14}px)`;
      } else {
        d.ghost.style.display = 'none';
      }
    },
    livePreviewHost(): HTMLElement {
      return ensureDom().liveHost;
    },
    hide(): void {
      if (!dom) return;
      dom.root.style.display = 'none';
      dom.preview.style.display = 'none';
      dom.dirGroup.style.display = 'none';
      dom.outerBox.style.display = 'none';
      dom.ghost.style.display = 'none';
    },
    destroy(): void {
      try { dom?.root.remove(); } catch { /* noop */ }
      dom = null;
    },
  };
  return handle;
}
