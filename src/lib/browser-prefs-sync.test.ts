/**
 * browser-prefs-sync · non-destructive restore.
 *
 * Regression guard for the "reset layout reverts on refresh" bug: the boot-time
 * `syncBrowserPrefsFromServer()` used to unconditionally overwrite every
 * localStorage key with the server snapshot. Because the snapshot is only
 * refreshed on a 30s interval / unreliable beforeunload, a same-tab layout reset
 * followed by a quick refresh got clobbered by the stale snapshot.
 *
 * `restoreBrowserLocalStorage` must now be NON-DESTRUCTIVE: it only fills keys
 * that are missing locally, so native localStorage (which survives reloads)
 * always wins over a stale snapshot.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

function clearAll(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }
}

describe('browser-prefs-sync · restoreBrowserLocalStorage (non-destructive)', () => {
  let registered = false;
  beforeEach(() => {
    try { GlobalRegistrator.register(); registered = true; } catch { registered = false; }
    clearAll();
  });
  afterEach(() => {
    clearAll();
    if (registered) GlobalRegistrator.unregister();
  });

  it('fills keys that are missing locally', async () => {
    const { restoreBrowserLocalStorage } = await import('./browser-prefs-sync');
    const n = restoreBrowserLocalStorage({
      'forgeax:project:default:page-layout:editor:center': '{"grid":"snapshot"}',
    });
    expect(n).toBe(1);
    expect(localStorage.getItem('forgeax:project:default:page-layout:editor:center'))
      .toBe('{"grid":"snapshot"}');
  });

  it('never overwrites a key that already exists locally (layout reset wins)', async () => {
    const key = 'forgeax:project:default:page-layout:editor:center';
    // Simulate the just-reset default layout already persisted in localStorage.
    localStorage.setItem(key, '{"grid":"reset-default"}');

    const { restoreBrowserLocalStorage } = await import('./browser-prefs-sync');
    // Server snapshot still carries the STALE pre-reset layout.
    const n = restoreBrowserLocalStorage({ [key]: '{"grid":"stale-old"}' });

    expect(n).toBe(0);
    expect(localStorage.getItem(key)).toBe('{"grid":"reset-default"}');
  });

  it('mixes fill (missing) and skip (present) in one restore', async () => {
    const present = 'forgeax:project:default:recent-page';
    const missing = 'forgeax:project:default:page-layout:agents:center';
    localStorage.setItem(present, '{"activeId":"local"}');

    const { restoreBrowserLocalStorage } = await import('./browser-prefs-sync');
    const n = restoreBrowserLocalStorage({
      [present]: '{"activeId":"snapshot"}',
      [missing]: '{"grid":"snapshot"}',
    });

    expect(n).toBe(1);
    expect(localStorage.getItem(present)).toBe('{"activeId":"local"}');
    expect(localStorage.getItem(missing)).toBe('{"grid":"snapshot"}');
  });

  it('ignores keys outside the sync allowlist', async () => {
    const { restoreBrowserLocalStorage } = await import('./browser-prefs-sync');
    const n = restoreBrowserLocalStorage({ 'unrelated-key': 'x' });
    expect(n).toBe(0);
    expect(localStorage.getItem('unrelated-key')).toBeNull();
  });
});
