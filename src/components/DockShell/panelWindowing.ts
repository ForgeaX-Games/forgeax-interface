import {
  canOpenPanelWindow,
  createPanelWindowingController,
  shouldShowDetachedPlaceholder,
  type DetachedWindowCapability,
  type OpenPanelWindowOptions,
  type SurfaceDescriptor,
} from '@forgeax/app-shell/window';

export { canOpenPanelWindow, shouldShowDetachedPlaceholder };
export type { OpenPanelWindowOptions } from '@forgeax/app-shell/window';

const panelWindowing = createPanelWindowingController();

export interface PanelWindowingSources {
  basePanelIds: ReadonlySet<string>;
  baseWindowing: Readonly<Record<string, DetachedWindowCapability>>;
  pageWindowing: Readonly<Record<string, DetachedWindowCapability>>;
  injectedWindowing?: DetachedWindowCapability;
}

/** Dockview prefixes editor placements with ep:, while injected descriptors use bare ids. */
export function injectedPanelDescriptorId(panelId: string): string {
  return panelId.startsWith('ep:') ? panelId.slice(3) : panelId;
}

/** Whether the Page runtime survives the later BASE/editor component spreads. */
export function pageRuntimeOwnsPanel(
  panelId: string,
  basePanelIds: ReadonlySet<string>,
  editorPanelIds: readonly string[],
): boolean {
  if (basePanelIds.has(panelId)) return false;
  return !(panelId.startsWith('ep:') && editorPanelIds.includes(panelId.slice(3)));
}

/**
 * Resolve capability with the same ownership precedence as DockRegion's final
 * component map: editor ep:* uses its injected descriptor; BASE wins even when
 * it deliberately has no capability; only unclaimed ids may fall through
 * Page → injected.
 */
export function resolvePanelWindowing(
  panelId: string,
  sources: PanelWindowingSources,
): DetachedWindowCapability | undefined {
  if (panelId.startsWith('ep:')) return sources.injectedWindowing;
  if (sources.basePanelIds.has(panelId)) return sources.baseWindowing[panelId];
  return sources.pageWindowing[panelId] ?? sources.injectedWindowing;
}

/**
 * The one high-level panel pop-out action used by every shell affordance.
 * It constructs the target, opens the physical carrier, and only then removes
 * an ordinary dock tab only when the target explicitly requests that behavior.
 */
export async function openPanelWindow(
  panelId: string,
  capability: DetachedWindowCapability | undefined,
  options: OpenPanelWindowOptions,
): Promise<boolean> {
  return panelWindowing.openPanelWindow(panelId, capability, options);
}

/**
 * Resolve the dock placement restored by a window-close event. This is a lookup,
 * not a consume: every DockRegion receives the same close notification and the
 * region that owns the placement must be allowed to handle it.
 */
export function detachedDockPanelForSurface(surface: SurfaceDescriptor): string | undefined {
  return panelWindowing.panelForClosedSurface(surface);
}
