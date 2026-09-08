// SSOT for "which tab is pinned in which edge group".
//
// edgeDrawer OWNS the rules (at most one pin per edge group; a pinned active tab
// defeats auto-dismiss) and writes here. DockTab READS here to render the Pin
// toggle. The split exists so the glyph is a RENDER of state rather than a
// runtime overwrite of React's own output: edgeDrawer used to do
// `action.innerHTML = PIN_SVG` on dockview events, which raced React's portal
// commit (on a fresh page the tab had no pin until some unrelated dockview event
// happened to re-run the swap) and had no inverse, so a panel dragged out of a
// strip kept a Pin glyph and a dead close button.
//
// Module-scoped adapter: App Shell owns the generic state while only the
// DockShell region supplies concrete Dockview group/panel identities.
import { createEdgePinStore } from '@forgeax/app-shell/window';

/** DOM contract between the two halves: DockTab stamps it on the toggle,
 *  edgeDrawer's capture-phase click handler `closest()`s for it. (The CSS in
 *  DockShell.css / GlobalStatusBar.css spells it literally, as CSS must.) */
export const EDGE_PIN_CLASS = 'fx-edge-pin';

const edgePins = createEdgePinStore();

export function subscribeEdgePins(onChange: () => void): () => void {
  return edgePins.onChange(onChange);
}

export function pinnedPanelIdIn(groupId: string): string | undefined {
  return edgePins.pinnedIn(groupId);
}

/** `panelId === undefined` unpins the group. No-ops (and stays silent) when the
 *  state already matches, so callers can fire it from reconcilers. */
export function setEdgePin(groupId: string, panelId: string | undefined): void {
  edgePins.setPinned(groupId, panelId);
}

export function clearEdgePins(): void {
  edgePins.clear();
}
