import { useEffect, useState } from 'react';
import {
  createWorkbenchBrowserClient,
  type WorkbenchCatalogEntry,
  type WorkbenchFetch,
} from '@forgeax/workbench-host/browser';

export const WORKBENCH_API_BASE = '/__workbench__/v1/';
const SHARED_WORKBENCH_SELECTION_PREFIX = 'shared-workbench:';

interface GameListPayload {
  readonly activeSlug?: string | null;
}

export interface WorkbenchCatalogState {
  readonly gameId: string | null;
  readonly entries: readonly WorkbenchCatalogEntry[];
  readonly loading: boolean;
  readonly error: Error | null;
}

export interface WorkbenchCatalogSource<TLegacy> {
  readonly slug: string;
  readonly legacy: TLegacy | null;
  readonly host: WorkbenchCatalogEntry | null;
}

export function mergeWorkbenchCatalogSources<TLegacy>(
  orderedSlugs: readonly string[],
  legacyEntries: readonly TLegacy[],
  legacySlug: (entry: TLegacy) => string,
  hostEntries: readonly WorkbenchCatalogEntry[],
): WorkbenchCatalogSource<TLegacy>[] {
  const legacyBySlug = new Map(legacyEntries.map((entry) => [legacySlug(entry), entry]));
  const hostBySlug = new Map(hostEntries.map((entry) => [extensionSlug(entry.extensionId), entry]));
  return orderedSlugs.flatMap((slug) => {
    const legacy = legacyBySlug.get(slug) ?? null;
    const host = hostBySlug.get(slug) ?? null;
    return legacy || host ? [{ slug, legacy, host }] : [];
  });
}

export function sharedWorkbenchSelection(extensionId: string): string {
  return `${SHARED_WORKBENCH_SELECTION_PREFIX}${extensionId}`;
}

export function sharedWorkbenchSelectionExtensionId(selection: string | null): string | null {
  return selection?.startsWith(SHARED_WORKBENCH_SELECTION_PREFIX)
    ? selection.slice(SHARED_WORKBENCH_SELECTION_PREFIX.length)
    : null;
}

/** A shared Host selection owns every pane declared by its catalog surface. */
export function sharedWorkbenchOwnsSurface(selection: string | null): boolean {
  return sharedWorkbenchSelectionExtensionId(selection) !== null;
}

export async function resolveWorkbenchGameId(
  pinnedSlug?: string | null,
  fetcher: WorkbenchFetch = fetch,
): Promise<string | null> {
  if (pinnedSlug) return pinnedSlug;
  const response = await fetcher('/api/workbench/games');
  if (!response.ok) throw new Error(`Active game request failed with ${response.status}`);
  const payload = await response.json() as GameListPayload;
  return typeof payload.activeSlug === 'string' && payload.activeSlug.length > 0
    ? payload.activeSlug
    : null;
}

export async function loadWorkbenchCatalog(
  gameId: string,
  fetcher?: WorkbenchFetch,
  signal?: AbortSignal,
): Promise<WorkbenchCatalogEntry[]> {
  return createWorkbenchBrowserClient({
    baseUrl: WORKBENCH_API_BASE,
    gameId,
    ...(fetcher ? { fetch: fetcher } : {}),
  }).catalog(signal);
}

export function useSharedWorkbenchCatalog(
  pinnedSlug?: string | null,
): WorkbenchCatalogState {
  const [state, setState] = useState<WorkbenchCatalogState>({
    gameId: null,
    entries: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ gameId: null, entries: [], loading: true, error: null });
    void resolveWorkbenchGameId(pinnedSlug)
      .then(async (gameId) => ({
        gameId,
        entries: gameId
          ? await loadWorkbenchCatalog(gameId, undefined, controller.signal)
          : [],
      }))
      .then(({ gameId, entries }) => {
        if (!controller.signal.aborted) {
          setState({ gameId, entries, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            gameId: null,
            entries: [],
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    return () => controller.abort();
  }, [pinnedSlug]);

  return state;
}

export function extensionSlug(extensionId: string): string {
  return extensionId
    .replace(/^@forgeax\/wb-/, 'wb-')
    .replace(/^@forgeax-extension\//, '')
    .replace(/^@forgeax-plugin\//, '');
}
