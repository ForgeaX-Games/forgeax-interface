/**
 * WindowManager — detach a surface into its own OS window and redock it.
 *
 * This is the "windowing" layer. It is the OUT-OF-window twin of keep-alive:
 * keep-alive hosts a surface CSS-hidden inside the main window; windowing hosts
 * it in a separate Tauri WebviewWindow. The owning store flips a surface
 * between `docked` and `floating` and this manager makes the OS-level change.
 *
 * Pattern adapted from gameclaw_pet/src/shared/window-manager.ts (dynamic
 * WebviewWindow create/destroy), but our detached windows reuse the SAME
 * frontend bundle — they load `index.html?surface=...` and the entry renders a
 * single <DetachedSurface>. Cross-window business state stays consistent for
 * free because every window talks to the same backend (/api, /ws).
 *
 * Browser form delegates its product-neutral popup lifecycle to App Shell;
 * Interface supplies only the ForgeaX surface URL policy. Tauri stays here as
 * a product runtime integration and loads the same surface URL contract.
 */
import { isTauri, loadWebviewWindowApi } from './runtime';
import {
  createBrowserWindowManager,
  createExternalWindowManager,
  type ExternalWindowHandle,
  type ExternalWindowHost,
  type SurfaceDescriptor,
  type WindowManager,
} from '@forgeax/app-shell/window';
import {
  encodeSurfaceWindowQuery,
  surfaceWindowUrl,
} from './surface';

let _manager: WindowManager | null = null;

export function getWindowManager(): WindowManager {
  if (!_manager) {
    _manager = isTauri()
      ? createExternalWindowManager({
          canDetach: isTauri,
          loadHost: loadTauriWindowHost,
        })
      : createBrowserWindowManager({
          surfaceUrl: (d) => `index.html?${encodeSurfaceWindowQuery(d, 'browser-page')}`,
        });
  }
  return _manager;
}

function toExternalWindowHandle(window: {
  show(): Promise<void>;
  setFocus(): Promise<void>;
  close(): Promise<void>;
}): ExternalWindowHandle {
  return {
    show: () => window.show(),
    focus: () => window.setFocus(),
    close: () => window.close(),
  };
}

async function loadTauriWindowHost(): Promise<ExternalWindowHost | undefined> {
  const mod = await loadWebviewWindowApi();
  if (!mod) return undefined;
  return {
    async getByLabel(label) {
      const window = await mod.WebviewWindow.getByLabel(label);
      return window ? toExternalWindowHandle(window) : null;
    },
    async create(label, surface, options, lifecycle) {
      const hasPosition = typeof options?.x === 'number' && typeof options?.y === 'number';
      const window = new mod.WebviewWindow(label, {
        url: surfaceWindowUrl(surface, 'tauri-webview'),
        title: options?.title ?? surface.id,
        width: options?.width ?? 960,
        height: options?.height ?? 720,
        ...(hasPosition ? { x: options!.x, y: options!.y } : { center: true }),
        resizable: true,
        // Preserve HTML5 Dockview drag-and-drop inside the detached Webview.
        dragDropEnabled: false,
      });
      try {
        await Promise.all([
          // Redock only after the OS window is actually gone.
          window.once('tauri://destroyed', lifecycle.destroyed),
          window.once('tauri://created', lifecycle.created),
          window.once('tauri://error', lifecycle.error),
        ]);
      } catch (error) {
        try { await window.close(); } catch { /* registration failed after creation */ }
        throw error;
      }
      return toExternalWindowHandle(window);
    },
  };
}
