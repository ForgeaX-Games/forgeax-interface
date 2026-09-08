/**
 * Platform layer — the single seam between the platform-agnostic React app and
 * the host it runs in (Tauri desktop shell vs plain browser / web-server form).
 *
 * Import from here, never reach into '@tauri-apps/*' directly from components.
 */
export {
  isTauri,
  platformRuntime,
  type PlatformRuntime,
} from './runtime';
export { getShellAdapter, type ShellAdapter } from './shell-adapter';
export { getWindowManager } from './window-manager';
export {
  getSurfaceWindowingController,
  VIEWPORT_CARRIER_WILL_DETACH,
} from './surface-windowing';
export { useFloatingSurfaces } from './use-surface-windowing';
export {
  type WindowManager,
  type DetachWindowOptions,
} from '@forgeax/app-shell/window';
export {
  type DetachedWindowCapability,
  type DetachedWindowTarget,
  type SurfaceDescriptor,
  type SurfaceKind,
  type SurfacePane,
  surfaceKey,
  surfaceWindowLabel,
  encodeSurfaceQuery,
  decodeSurfaceFromLocation,
} from '@forgeax/app-shell/window';
export {
  type DetachedViewportCarrierKind,
  encodeSurfaceWindowQuery,
  surfaceWindowUrl,
} from './surface';
