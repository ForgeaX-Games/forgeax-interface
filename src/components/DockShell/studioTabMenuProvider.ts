import type { DockviewApi, GetTabContextMenuItemsParams } from 'dockview';
import { getWindowManager } from '../../lib/platform';
import { isDockTitleHidden } from './dockTitle';
import { nearerSideEdge, isOnSideEdge, type SideEdge } from './sideEdgeMove';
import type { PanelTabCommands } from './panelTabCommands';
import {
  canOpenPanelWindow,
  resolvePanelWindowing,
  type PanelWindowingSources,
} from './panelWindowing';
import { buildTabContextMenuItems } from './tabContextMenu';
import type { DockRegion } from './regions';

export interface StudioTabMenuProviderDeps {
  region: DockRegion;
  getWrapEl: () => HTMLElement | null;
  getApi: () => DockviewApi | null;
  commands: PanelTabCommands;
  windowingSources: PanelWindowingSources;
}

export function createStudioTabContextMenuHandler(
  deps: StudioTabMenuProviderDeps,
): (params: GetTabContextMenuItemsParams) => ReturnType<typeof buildTabContextMenuItems> {
  const { region, getWrapEl, getApi, commands, windowingSources } = deps;

  return (params) => {
    const api = getApi();
    const wrapEl = getWrapEl();
    const loc = params.panel.api.location;
    const onSide = isOnSideEdge(loc);
    let nearer: SideEdge = 'left';
    if (api && !onSide) {
      const panelRect = params.group.element.getBoundingClientRect();
      const shellEl = (params.group.element.closest('.dv-shell') ?? wrapEl) as HTMLElement | null;
      const shellRect = shellEl?.getBoundingClientRect() ?? panelRect;
      nearer = nearerSideEdge(panelRect, shellRect);
    }

    const windowing = resolvePanelWindowing(params.panel.id, windowingSources);
    const canPopOut = canOpenPanelWindow(windowing, getWindowManager().canDetach());

    return buildTabContextMenuItems(
      region,
      params.panel.id,
      (panelId, target) => commands.transferToRegion(panelId, target),
      {
        groupPanelCount: params.group.panels.length,
        titleHidden: isDockTitleHidden(params.group.element),
        onHideTitle: () => commands.setTitleBarHidden(params.group.element, true),
        onShowTitle: () => commands.setTitleBarHidden(params.group.element, false),
      },
      region === 'DockShell' && api
        ? {
            onSideEdge: onSide,
            nearerSide: nearer,
            onMoveToSide: (side) => commands.moveToEdge(params.panel, side),
            onMoveOffSide: () => commands.moveOffEdge(params.panel),
          }
        : undefined,
      {
        onClose: () => commands.close(params.panel),
        onCloseOthers: () => commands.closeOthers(params.panel, params.group),
      },
      canPopOut ? { onPopOut: () => commands.detach(params.panel, windowing) } : undefined,
    );
  };
}
