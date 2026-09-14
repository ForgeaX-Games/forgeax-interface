/** Same-origin invalidation only: values stay authoritative at the host API. */
const KEY = 'forgeax.configRevision';
export function notifyConfigChanged(resource: string): void {
  window.dispatchEvent(new CustomEvent(KEY, { detail: resource }));
  try { localStorage.setItem(KEY, JSON.stringify({ resource, revision: crypto.randomUUID() })); } catch { /* focus revalidation remains available */ }
}
export function onConfigChanged(resource: string, refresh: () => void): () => void {
  const local = (event: Event) => { if ((event as CustomEvent).detail === resource) refresh(); };
  const remote = (event: StorageEvent) => {
    if (event.key !== KEY || !event.newValue) return;
    try { if (JSON.parse(event.newValue).resource === resource) refresh(); } catch { /* malformed external value */ }
  };
  window.addEventListener(KEY, local);
  window.addEventListener('storage', remote);
  window.addEventListener('focus', refresh);
  return () => {
    window.removeEventListener(KEY, local);
    window.removeEventListener('storage', remote);
    window.removeEventListener('focus', refresh);
  };
}
