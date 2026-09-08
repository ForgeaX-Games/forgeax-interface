import { useEffect, useState } from 'react';
import { listExtensionsShared, type ExtensionInfo } from './extension-api';

/** Match the canonical manifest identity. Legacy ids are migrated before
 * opening a Page; the runtime host never carries an alias path. */
export function manifestMatchesId(m: ExtensionInfo, id: string): boolean {
  return m.id === id;
}

/** Fetches the bus manifest for a single plugin id, with retry/polling so a
 *  transient miss (busy server, manifest still settling, bus reload window)
 *  self-heals instead of leaving the panel stuck until the user switches tabs.
 *
 *  - First attempt rides the shared 2s cache → instant on tab switch-back.
 *  - Subsequent attempts force a fresh fetch (every POLL_MS) so a manifest that
 *    just gained `entry.standalone` is picked up live.
 *  - Polling stops once we have a usable manifest (standalone present) or after
 *    MAX_ATTEMPTS (the plugin genuinely ships no standalone entry — e.g. the
 *    inline extension panel — so there is nothing more to wait for).
 *
 *  Extracted from ExtensionHostPanel so the keep-alive layer can
 *  share one implementation (single source of truth for manifest resolution).
 */
export function useExtensionManifest(extensionId: string): ExtensionInfo | null | 'loading' {
  const [info, setInfo] = useState<ExtensionInfo | null | 'loading'>('loading');
  useEffect(() => {
    if (!extensionId) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const MAX_ATTEMPTS = 15; // ~22s at POLL_MS — covers cold start / scan windows
    const POLL_MS = 1500;
    setInfo('loading');

    const tick = async () => {
      attempts += 1;
      try {
        const res = await listExtensionsShared({ force: attempts > 1 });
        if (cancelled) return;
        const found = res.items.find((p) => manifestMatchesId(p, extensionId)) ?? null;
        setInfo(found);
        if (found?.frontendUrl || found?.entry?.standalone || found?.entry?.frontend || attempts >= MAX_ATTEMPTS) return;
      } catch {
        if (cancelled) return;
        if (attempts >= MAX_ATTEMPTS) {
          setInfo(null);
          return;
        }
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [extensionId]);
  return info;
}
