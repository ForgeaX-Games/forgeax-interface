import type { Cleanup } from '../extension-foundation/types';
import type { PanelActionContribution, PanelActionsApi } from './types';

interface Entry {
  readonly owner: string;
  readonly actions: readonly PanelActionContribution[];
}

export interface PanelActionRegistry extends PanelActionsApi {
  contribute(owner: string, actions: readonly PanelActionContribution[]): Cleanup;
}

export function createPanelActionRegistry(): PanelActionRegistry {
  const entries: Entry[] = [];
  const listeners = new Set<() => void>();
  let cache: readonly PanelActionContribution[] | null = null;
  let version = 0;

  const emit = (): void => {
    cache = null;
    version++;
    for (const listener of [...listeners]) listener();
  };
  const all = (): readonly PanelActionContribution[] => {
    if (cache) return cache;
    cache = entries.flatMap((entry) => entry.actions).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return cache;
  };

  return {
    contribute(owner, actions) {
      const entry: Entry = { owner, actions };
      entries.push(entry);
      emit();
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        const index = entries.indexOf(entry);
        if (index >= 0) entries.splice(index, 1);
        emit();
      };
    },
    list(panelId) {
      return all().filter((action) => action.panelId === panelId);
    },
    all,
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    version() {
      return version;
    },
  };
}
