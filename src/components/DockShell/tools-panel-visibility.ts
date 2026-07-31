import { sharedWorkbenchOwnsSurface } from '../../workbench/catalog';

/** The legacy tools panel must not reserve space beside a Host-owned surface. */
export function shouldHideToolsPanel(
  sidebarCollapsed: boolean,
  workbenchExpandedExtensionId: string | null,
): boolean {
  return sidebarCollapsed || sharedWorkbenchOwnsSurface(workbenchExpandedExtensionId);
}
