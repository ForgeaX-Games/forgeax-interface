import { useCallback, useEffect, useState } from 'react';
import {
  createExtensionBrowserClient,
  type ExtensionCatalogEntry,
  type ExtensionFetch,
} from '@forgeax/extension-host/browser';

export const EXTENSION_API_BASE = '/__extension__/v1/';
const EXTENSION_HOST_EXTENSION_IDS = new Set([
  '@forgeax-extension/video-game',
  '@forgeax-extension/game-video',
]);

const catalogRequests = new Map<string, Promise<readonly ExtensionCatalogEntry[]>>();

export function isExtensionHostExtension(extensionId: string): boolean {
  return EXTENSION_HOST_EXTENSION_IDS.has(extensionId);
}

export async function loadExtensionCatalog(
  gameId: string,
  fetcher?: ExtensionFetch,
  signal?: AbortSignal,
): Promise<ExtensionCatalogEntry[]> {
  return createExtensionBrowserClient({
    baseUrl: EXTENSION_API_BASE,
    gameId,
    ...(fetcher ? { fetch: fetcher } : {}),
  }).catalog(signal);
}

/** A Page can mount left and center placements for the same extension. Keep the
 * catalog request shared so both panels resolve one authoritative runtime. */
export function loadSharedExtensionCatalog(
  gameId: string,
  fetcher?: ExtensionFetch,
): Promise<readonly ExtensionCatalogEntry[]> {
  const current = catalogRequests.get(gameId);
  if (current) return current;

  const request = loadExtensionCatalog(gameId, fetcher).catch((error: unknown) => {
    if (catalogRequests.get(gameId) === request) catalogRequests.delete(gameId);
    throw error;
  });
  catalogRequests.set(gameId, request);
  return request;
}

export function invalidateExtensionCatalog(gameId?: string): void {
  if (gameId) catalogRequests.delete(gameId);
  else catalogRequests.clear();
}

interface ExtensionRuntimeState {
  readonly descriptor: ExtensionCatalogEntry | null;
  readonly loading: boolean;
  readonly error: Error | null;
}

export function useExtensionCatalogEntry(
  extensionId: string,
  gameId: string | null,
  gameResolved: boolean,
): ExtensionRuntimeState & { readonly retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ExtensionRuntimeState>({
    descriptor: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!gameResolved) {
      setState({ descriptor: null, loading: true, error: null });
      return;
    }
    if (!gameId) {
      setState({ descriptor: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ descriptor: null, loading: true, error: null });
    void loadSharedExtensionCatalog(gameId)
      .then((entries) => {
        if (cancelled) return;
        setState({
          descriptor: entries.find((entry) => entry.extensionId === extensionId) ?? null,
          loading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          descriptor: null,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
    return () => { cancelled = true; };
  }, [attempt, extensionId, gameId, gameResolved]);

  const retry = useCallback(() => {
    if (gameId) invalidateExtensionCatalog(gameId);
    setAttempt((value) => value + 1);
  }, [gameId]);

  return { ...state, retry };
}
