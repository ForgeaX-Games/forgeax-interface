/**
 * Platform layer — the single seam between the platform-agnostic React app and
 * the host it runs in (Tauri desktop shell vs plain browser / web-server form).
 *
 * Import from here, never reach into '@tauri-apps/*' directly from components.
 */

export {
	type DetachedWindowCapability,
	type DetachedWindowTarget,
	type DetachWindowOptions,
	decodeSurfaceFromLocation,
	encodeSurfaceQuery,
	type SurfaceDescriptor,
	type SurfaceKind,
	type SurfacePane,
	surfaceKey,
	surfaceWindowLabel,
	type WindowManager,
} from "@forgeax/app-shell/window";
export {
	isTauri,
	type PlatformRuntime,
	platformRuntime,
} from "./runtime";
export { getShellAdapter, type ShellAdapter } from "./shell-adapter";
export {
	type DetachedViewportCarrierKind,
	encodeSurfaceWindowQuery,
	surfaceWindowUrl,
} from "./surface";
export {
	getSurfaceWindowingController,
	VIEWPORT_CARRIER_WILL_DETACH,
} from "./surface-windowing";
export { useFloatingSurfaces } from "./use-surface-windowing";
export { getWindowManager } from "./window-manager";
