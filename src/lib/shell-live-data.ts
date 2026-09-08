import { useSyncExternalStore } from 'react';
import type { HealthResponse } from './dashboard-api';
import type { ExtensionListResponse } from './extension-api';
import {
  deriveExtensionKindCounts,
  startResilientPoll,
  type ExtensionKindCounts,
} from './resilient-polling';

export type LiveSnapshot<T> =
  | { state: 'loading' }
  | { state: 'ok'; value: T }
  | { state: 'down' };

function createLiveStore<T>(
  load: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
) {
  let snapshot: LiveSnapshot<T> = { state: 'loading' };
  const listeners = new Set<() => void>();
  let stop: (() => void) | undefined;
  const emit = () => listeners.forEach((listener) => listener());
  const start = () => startResilientPoll(async (signal) => {
    try {
      const value = await load(signal);
      snapshot = { state: 'ok', value };
    } catch (error) {
      if (signal.aborted) throw error;
      snapshot = { state: 'down' };
      throw error;
    } finally {
      emit();
    }
  }, { intervalMs, timeoutMs: 5_000 });
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) stop = start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop?.();
          stop = undefined;
        }
      };
    },
    getSnapshot: () => snapshot,
  };
}

const healthStore = createLiveStore<HealthResponse>(async (signal) => {
  const response = await fetch('/api/health', { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`/api/health ${response.status}`);
  return response.json() as Promise<HealthResponse>;
}, 5_000);

const extensionCountsStore = createLiveStore<ExtensionKindCounts>(async (signal) => {
  const response = await fetch('/api/extensions/list', { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`/api/extensions/list ${response.status}`);
  const payload = await response.json() as ExtensionListResponse;
  return deriveExtensionKindCounts(payload.items);
}, 12_000);

export function useSharedHealth(): LiveSnapshot<HealthResponse> {
  return useSyncExternalStore(healthStore.subscribe, healthStore.getSnapshot, healthStore.getSnapshot);
}

export function useSharedExtensionCounts(): LiveSnapshot<ExtensionKindCounts> {
  return useSyncExternalStore(
    extensionCountsStore.subscribe,
    extensionCountsStore.getSnapshot,
    extensionCountsStore.getSnapshot,
  );
}
