import { FOOTER_PANEL_ID_LIST, FOOTER_PANEL_IDS } from './footer-panels';

/** User intent for footer chrome tabs (Content Browser, Info, …). Distinct from
 *  dockview mount state: `ensureFooterPanels` must not resurrect panels the user
 *  hid via the layout menu or `app.panel.toggle`. */
const visibleById = new Map<string, boolean>(
  FOOTER_PANEL_ID_LIST.map((id) => [id, true]),
);
const listeners = new Set<() => void>();
let ensureMounted: (() => void) | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

/** edgeDrawer registers the routine that mounts visible footer tabs. */
export function registerFooterPanelEnsure(fn: () => void): () => void {
  ensureMounted = fn;
  return () => {
    if (ensureMounted === fn) ensureMounted = null;
  };
}

export function requestFooterPanelEnsure(): void {
  ensureMounted?.();
}

export function isFooterPanelId(panelId: string): boolean {
  return FOOTER_PANEL_IDS.has(panelId);
}

export function isFooterPanelUserVisible(panelId: string): boolean {
  if (!isFooterPanelId(panelId)) return true;
  return visibleById.get(panelId) ?? true;
}

export function setFooterPanelUserVisible(panelId: string, visible: boolean): void {
  if (!isFooterPanelId(panelId)) return;
  const prev = visibleById.get(panelId) ?? true;
  if (prev === visible) return;
  visibleById.set(panelId, visible);
  notify();
}

export function subscribeFooterPanelVisibility(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
