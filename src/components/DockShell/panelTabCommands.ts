import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from 'dockview';
import type { DetachedWindowCapability } from '@forgeax/app-shell/window';
import { getSurfaceWindowingController } from '../../lib/platform/surface-windowing';
import { getDockRegions } from './dockviewRegistry';
import { setDockTitleHidden } from './dockTitle';
import { openPanelWindow } from './panelWindowing';
import type { DockRegion } from './regions';
import type { SideEdge } from './sideEdgeMove';
import { setFooterPanelUserVisible, isFooterPanelId } from './footer-panel-visibility';

/** Narrow dockview api shape used for cross-region panel transfer. */
interface DockRegionTransferApi {
  getPanel(id: string): {
    readonly api: {
      close(): void;
      readonly title?: string;
    };
    readonly params?: Record<string, unknown>;
  } | undefined;
  addPanel(options: {
    id: string;
    component: string;
    title?: string;
    params?: Record<string, unknown>;
  }): unknown;
}

function dockRegionTransferApi(api: unknown): DockRegionTransferApi {
  return api as DockRegionTransferApi;
}

export interface PanelTabCommandsDeps {
  getApi: () => DockviewApi | null;
  titleFor: (id: string) => string;
}

export interface PanelTabCommands {
  close(panel: IDockviewPanel): void;
  closeOthers(active: IDockviewPanel, group: DockviewGroupPanel): void;
  moveToEdge(panel: IDockviewPanel, side: SideEdge): void;
  moveOffEdge(panel: IDockviewPanel): void;
  setTitleBarHidden(groupEl: HTMLElement, hidden: boolean): void;
  transferToRegion(panelId: string, targetRegion: DockRegion): void;
  detach(panel: IDockviewPanel, capability: DetachedWindowCapability | undefined): void;
}

export function createPanelTabCommands(deps: PanelTabCommandsDeps): PanelTabCommands {
  const { getApi, titleFor } = deps;

  return {
    close(panel) {
      if (isFooterPanelId(panel.id)) setFooterPanelUserVisible(panel.id, false);
      try { panel.api.close(); } catch { /* noop */ }
    },

    closeOthers(active, group) {
      for (const panel of group.panels) {
        if (panel.id === active.id) continue;
        try { panel.api.close(); } catch { /* noop */ }
      }
    },

    moveToEdge(panel, side) {
      const api = getApi();
      if (!api) return;
      const edgeApi = api.getEdgeGroup(side);
      if (!edgeApi) return;
      const edgeGroup = api.groups.find((group) => group.api.id === edgeApi.id);
      if (!edgeGroup) return;
      try { api.setEdgeGroupVisible(side, true); } catch { /* noop */ }
      edgeGroup.element.classList.remove('fx-edge-empty');
      try { panel.api.moveTo({ group: edgeGroup, position: 'center' }); } catch { /* noop */ }
      try { edgeGroup.api.collapse(); } catch { /* noop */ }
      try { panel.api.setActive(); } catch { /* noop */ }
    },

    moveOffEdge(panel) {
      const api = getApi();
      if (!api) return;
      const gridGroup = api.groups.find((group) => group.api.location.type === 'grid');
      if (!gridGroup) return;
      const loc = panel.api.location;
      const fromSide = loc.type === 'edge' && (loc.position === 'left' || loc.position === 'right')
        ? loc.position
        : 'left';
      try { panel.api.moveTo({ group: gridGroup, position: fromSide }); } catch { /* noop */ }
      try { panel.api.setActive(); } catch { /* noop */ }
    },

    setTitleBarHidden(groupEl, hidden) {
      setDockTitleHidden(groupEl, hidden);
    },

    transferToRegion(panelId, targetRegion) {
      const regions = getDockRegions();
      const target = regions.find((entry) => entry.region === targetRegion);
      if (!target) return;
      const targetApi = dockRegionTransferApi(target.api);
      const source = regions.find((entry) => dockRegionTransferApi(entry.api).getPanel(panelId));
      if (source?.region === targetRegion) return;

      const sourcePanel = source ? dockRegionTransferApi(source.api).getPanel(panelId) : undefined;
      if (sourcePanel) {
        const component = panelId;
        const title = sourcePanel.api.title || titleFor(panelId);
        const params = sourcePanel.params;
        try { sourcePanel.api.close(); } catch { /* noop */ }
        try {
          targetApi.addPanel({
            id: panelId,
            component,
            title,
            params,
          });
        } catch { /* noop */ }
        return;
      }

      if (targetApi.getPanel(panelId)) return;
      try {
        targetApi.addPanel({
          id: panelId,
          component: panelId,
          title: titleFor(panelId),
        });
      } catch { /* noop */ }
    },

    detach(panel, capability) {
      void openPanelWindow(panel.id, capability, {
        detachSurface: getSurfaceWindowingController().detachSurface,
        closeDockPanel: () => {
          try { panel.api.close(); } catch { /* noop */ }
        },
      });
    },
  };
}
