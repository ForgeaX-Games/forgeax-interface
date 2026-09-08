import {
  encodeSurfaceQuery,
  type SurfaceDescriptor,
} from '@forgeax/app-shell/window';

export {
  decodeSurfaceFromLocation,
  encodeSurfaceQuery,
  surfaceKey,
  surfaceWindowLabel,
  type DetachedWindowCapability,
  type DetachedWindowTarget,
  type SurfaceDescriptor,
  type SurfaceKind,
  type SurfacePane,
} from '@forgeax/app-shell/window';

export type DetachedViewportCarrierKind = 'browser-page' | 'tauri-webview';

/** Add the fenced Runtime identity only to the Viewport surface. Business panels remain ordinary shell pages. */
export function encodeSurfaceWindowQuery(
  d: SurfaceDescriptor,
  carrierKind: DetachedViewportCarrierKind,
  generation: number = Date.now(),
  hostOrigin: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
): string {
  const params = new URLSearchParams(encodeSurfaceQuery(d));
  if (d.kind === 'panel' && (d.id === 'viewport' || d.id === 'edit' || d.id === 'preview')) {
    params.set('runtimeId', 'edit-runtime');
    params.set('runtimeGeneration', String(generation));
    params.set('carrierId', `${carrierKind}-${generation}`);
    params.set('carrierKind', carrierKind);
    params.set('hostOrigin', hostOrigin);
  }
  return params.toString();
}

/** Build the carrier URL from the page that owns the Runtime lease.
 *
 * Tauri treats a relative `index.html?...` URL as a bundled app asset even when
 * the main WebView was navigated to a remote sidecar. Keeping the current
 * origin and pathname makes the detached WebView load the same frontend and
 * preserves same-origin Runtime transport.
 */
export function surfaceWindowUrl(
  d: SurfaceDescriptor,
  carrierKind: DetachedViewportCarrierKind,
  currentHref: string = typeof window !== 'undefined' ? window.location.href : 'http://localhost/',
  generation: number = Date.now(),
): string {
  const url = new URL(currentHref);
  url.search = encodeSurfaceWindowQuery(d, carrierKind, generation, url.origin);
  url.hash = '';
  return url.href;
}
