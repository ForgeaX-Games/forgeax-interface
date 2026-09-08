import { createElement } from 'react';
import {
  encodePageKey,
  qualifyContributionId,
  resolveContributionRef,
} from '@forgeax/types';
import {
  listExtensions,
  type ExtensionInfo,
  type ExtensionListResponse,
} from '../../lib/extension-api';
import { ExtensionHostPanel } from '../../components/DockShell/ExtensionHostPanel';
import { isExtensionHostExtension } from '../../components/DockShell/extensionRuntime';
import { getLocale } from '../../i18n';
import type { AppExtension } from './types';
import type { AppHostControl } from './host';
import type { Cleanup } from '../extension-foundation/types';
import type {
  ActivityRegistration,
  PageTypeRegistration,
  PanelTypeRegistration,
  ResourceEditorRegistration,
} from '../page-platform';

function title(value: string | { zh?: string; en?: string; ja?: string }): string {
  if (typeof value === 'string') return value;
  const locale = getLocale();
  return value[locale] ?? value.en ?? value.zh ?? value.ja ?? '';
}

export function catalogExtensionItems(payload: unknown): readonly ExtensionInfo[] {
  if (!payload || typeof payload !== 'object') return [];
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? items as ExtensionInfo[] : [];
}

type ExtensionPane = 'left' | 'center';

export function extensionPane(initialProps?: Readonly<Record<string, unknown>>): ExtensionPane | undefined {
  const pane = initialProps?.pane;
  return pane === 'left' || pane === 'center' ? pane : undefined;
}

/** Adapt scanner-normalized panel types into Page runtime registrations. */
function extensionHostPanelRegistration(
  item: ExtensionInfo,
  panelTypeId: PanelTypeRegistration['id'],
): PanelTypeRegistration {
  return {
    id: panelTypeId,
    runtime: {
      kind: 'inline',
      render: (context) => createElement(ExtensionHostPanel, {
        extensionId: item.id,
        pane: extensionPane(context.initialProps),
      }),
    },
    ...(item.entry?.standalone && !isExtensionHostExtension(item.id)
      ? {
          windowing: {
            createTarget: (context) => {
              const pane = extensionPane(context.initialProps);
              return {
                surface: {
                  kind: 'plugin' as const,
                  id: item.id,
                  ...(pane ? { pane } : {}),
                  instance: `${encodePageKey(context.pageKey)}::${context.placementId}`,
                },
                title: title(item.displayName),
                width: 960,
                height: 720,
                dockBehavior: 'keep-anchor' as const,
              };
            },
          },
        }
      : {}),
  };
}

export function catalogPanelTypeRegistrations(item: ExtensionInfo): PanelTypeRegistration[] {
  const byId = new Map<PanelTypeRegistration['id'], PanelTypeRegistration>();
  for (const panel of item.contributes?.panelTypes ?? []) {
    const id = qualifyContributionId(item.id, 'panel', panel.id) as PanelTypeRegistration['id'];
    byId.set(id, extensionHostPanelRegistration(item, id));
  }
  for (const page of item.contributes?.pages ?? []) {
    for (const placement of page.panels ?? []) {
      const id = resolveContributionRef(item.id, 'panel', placement.panelType) as PanelTypeRegistration['id'];
      if (!byId.has(id)) byId.set(id, extensionHostPanelRegistration(item, id));
    }
  }
  return [...byId.values()];
}

/** Browser-side activation of scanner-normalized page contributions. Hosts may
 * override an extension with a richer in-process implementation by using the
 * same extension id; those ids are filtered before this adapter runs. */
export function catalogPageExtensions(
  items: readonly ExtensionInfo[],
  overriddenIds: ReadonlySet<string>,
): readonly AppExtension[] {
  if (import.meta.env.DEV) {
    console.info('[forgeax:dev-extension] catalog candidates', items
      .filter((item) => item.runtimeMode === 'dev' || item.runtimeMode === 'native-module')
      .map((item) => ({
        id: item.id,
        pages: item.contributes?.pages?.length ?? 0,
        activities: item.contributes?.activities?.length ?? 0,
        overridden: overriddenIds.has(item.id),
      })));
  }
  return items.flatMap((item): AppExtension[] => {
    const contributes = item.contributes;
    if (!contributes?.pages?.length || overriddenIds.has(item.id)) return [];

    const panelTypes = catalogPanelTypeRegistrations(item);
    const pages: PageTypeRegistration[] = contributes.pages.map((page) => {
      const placements = (page.panels ?? []).map((placement) => ({
        id: placement.id,
        panelTypeId: resolveContributionRef(item.id, 'panel', placement.panelType) as PanelTypeRegistration['id'],
        title: placement.title ? title(placement.title) : undefined,
        optional: placement.optional,
        initialProps: placement.initialProps,
      }));
      return {
        id: qualifyContributionId(item.id, 'page', page.id) as PageTypeRegistration['id'],
        title: title(page.title),
        cardinality: page.cardinality,
        restorePolicy: page.restorePolicy,
        layoutVersion: page.layoutVersion,
        panels: placements,
        layout: page.layout,
      };
    });
    const activities: ActivityRegistration[] = (contributes.activities ?? []).map((activity) => ({
      id: qualifyContributionId(item.id, 'activity', activity.id) as ActivityRegistration['id'],
      title: title(activity.title),
      titleI18n: typeof activity.title === 'string' ? undefined : activity.title,
      description: item.description ? title(item.description) : undefined,
      descriptionI18n: item.description && typeof item.description !== 'string'
        ? item.description
        : undefined,
      icon: activity.icon,
      category: activity.category,
      order: activity.order,
      // Host-injected source layer — scanner-loaded extensions are all
      // installed-tier, so they sort AFTER builtin core nav regardless of the
      // `order` they declare (or omit). Never taken from the manifest.
      sourceLayer: 'installed',
      pageTypeId: activity.pageType
        ? resolveContributionRef(item.id, 'page', activity.pageType) as PageTypeRegistration['id']
        : undefined,
      commandId: activity.commandId,
    }));
    const resourceEditors: ResourceEditorRegistration[] = (contributes.resourceEditors ?? []).map((editor) => ({
      id: qualifyContributionId(item.id, 'resource-editor', editor.id) as ResourceEditorRegistration['id'],
      selector: editor.selector,
      pageTypeId: resolveContributionRef(item.id, 'page', editor.pageType) as PageTypeRegistration['id'],
      priority: editor.priority,
      sourceLayer: 'installed',
    }));
    if (import.meta.env.DEV && (item.runtimeMode === 'dev' || item.runtimeMode === 'native-module')) {
      console.info('[forgeax:dev-extension] catalog activated', {
        id: item.id,
        panelTypes: panelTypes.map((panel) => panel.id),
        pages: pages.map((page) => page.id),
        activities: activities.map((activity) => activity.id),
      });
    }
    return [{
      id: item.id,
      version: item.version,
      requires: ['pages'],
      contributes: { panelTypes, pages, activities, resourceEditors },
    }];
  });
}

export async function loadCatalogPageExtensions(
  overriddenIds: ReadonlySet<string>,
): Promise<readonly AppExtension[]> {
  try {
    const response = await listExtensions();
    return catalogPageExtensions(catalogExtensionItems(response), overriddenIds);
  } catch {
    return [];
  }
}

interface CatalogRuntimeRecord {
  readonly signature: string;
  readonly cleanup: Cleanup;
}

function catalogItemSignature(item: ExtensionInfo | undefined): string {
  if (!item) return '';
  const { registryGeneration: _registryGeneration, ...content } = item;
  return JSON.stringify(content);
}

export interface CatalogPageExtensionRuntime {
  refresh(): Promise<void>;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

/** Registry-generation-driven lifecycle for scanner contributions. It only
 * owns catalog Page/Panel/Activity registrations; product overrides and
 * in-process extension setup remain under the main ExtensionLoader. */
export function createCatalogPageExtensionRuntime(options: {
  control: Pick<AppHostControl, 'contributePagePlatform'>;
  overriddenIds: ReadonlySet<string>;
  load?: () => Promise<ExtensionListResponse>;
  pollIntervalMs?: number;
  onError?: (error: unknown, extensionId: string, phase: 'register' | 'cleanup') => void;
}): CatalogPageExtensionRuntime {
  const load = options.load ?? (() => listExtensions());
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const onError = options.onError ?? ((error, extensionId, phase) => {
    console.error(`[forgeax:extension-catalog] ${phase} failed for "${extensionId}"`, error);
  });
  const active = new Map<string, CatalogRuntimeRecord>();
  let generation: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let chain = Promise.resolve();
  let disposed = false;

  const reconcile = async (response: ExtensionListResponse): Promise<void> => {
    if (generation !== undefined && response.generation === generation) return;
    const itemsById = new Map(response.items.map((item) => [item.id, item]));
    const next = new Map(catalogPageExtensions(response.items, options.overriddenIds)
      .map((extension) => [extension.id, extension]));

    for (const [id, record] of [...active]) {
      const item = itemsById.get(id);
      const signature = catalogItemSignature(item);
      if (!next.has(id) || signature !== record.signature) {
        try {
          await record.cleanup();
          active.delete(id);
        } catch (error) {
          onError(error, id, 'cleanup');
        }
      }
    }
    for (const [id, extension] of next) {
      if (active.has(id)) continue;
      const contributes = extension.contributes;
      try {
        const cleanup = options.control.contributePagePlatform(id, {
          pageTypes: contributes?.pages,
          panelTypes: contributes?.panelTypes,
          activities: contributes?.activities,
          resourceEditors: contributes?.resourceEditors,
        });
        active.set(id, { signature: catalogItemSignature(itemsById.get(id)), cleanup });
      } catch (error) {
        onError(error, id, 'register');
      }
    }
    generation = response.generation;
  };

  const refresh = (): Promise<void> => {
    chain = chain.catch(() => undefined).then(async () => {
      if (!disposed) await reconcile(await load());
    });
    return chain;
  };

  return {
    refresh,
    async start() {
      await refresh().catch(() => undefined);
      if (pollIntervalMs > 0 && !disposed) {
        timer = setInterval(() => { void refresh().catch(() => undefined); }, pollIntervalMs);
      }
    },
    async dispose() {
      disposed = true;
      if (timer) clearInterval(timer);
      await chain.catch(() => undefined);
      for (const record of [...active.values()].reverse()) await record.cleanup();
      active.clear();
    },
  };
}
