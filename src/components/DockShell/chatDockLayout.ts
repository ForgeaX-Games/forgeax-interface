export interface ChatDockviewLayoutSize {
  width: number;
  height: number;
}

/**
 * Dockview must be laid out against its own flex item. The ChatDock inner shell
 * also contains SessionTabStrip, so measuring either the outer column or the
 * inner shell overstates Dockview's height by the tab-strip height.
 */
export function readChatDockviewLayoutSize(
  inner: HTMLElement | null,
): ChatDockviewLayoutSize | null {
  const dockview = inner?.querySelector<HTMLElement>('.fx-dockshell');
  if (!dockview || dockview.clientWidth <= 0 || dockview.clientHeight <= 0) return null;
  return { width: dockview.clientWidth, height: dockview.clientHeight };
}
