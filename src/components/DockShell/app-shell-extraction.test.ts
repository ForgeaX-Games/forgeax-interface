import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readSource = (relativePath: string): string => readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8',
);

describe('app-shell extraction boundary', () => {
  test.each([
    './regions.ts',
    './resolveRegion.ts',
    './dockviewRegistry.ts',
    './sideEdgeMove.ts',
    './crossInstanceDrop.ts',
  ])('%s remains a compatibility re-export without a local implementation', (relativePath) => {
    const source = readSource(relativePath);

    expect(source).toContain("from '@forgeax/app-shell/dock'");
    expect(source).not.toMatch(/\b(?:const|function|class|interface)\s+\w+/);
  });

  test('representative Interface surfaces render app-shell primitives', () => {
    const panelShell = readSource('../PanelShell/PanelShell.tsx');
    const mainArea = readSource('../MainArea/MainArea.tsx');

    expect(panelShell).toMatch(
      /import\s*\{[^}]*PanelSurface[^}]*\}\s*from '@forgeax\/app-shell\/react'/s,
    );
    expect(panelShell).toContain('<PanelSurface');
    expect(panelShell).not.toContain('<ShellSlot');
    expect(mainArea).toContain("from '@forgeax/app-shell/react'");
    expect(mainArea).toContain('<ShellSlot name="MainAreaBody"');
  });

  test('cross-realm factories use the Extension Platform transport boundary', () => {
    const renderers = readSource('./panelRenderers.ts');
    const host = readSource('../ExtensionHost/ExtensionIframeHost.tsx');

    expect(renderers).toContain('extensionTransport?:');
    expect(host).toContain('const { extensionTransport } = usePanelRenderers()');
    expect(renderers).not.toContain('hostSDK');
    expect(host).not.toContain('hostSDK');
  });

  test('generic panel surface presentation belongs to App Shell', () => {
    const appCss = readSource('../../App.css');
    const panelCss = readSource('../PanelShell/PanelShell.css');

    expect(appCss).toContain("@import '@forgeax/app-shell/panel.css';");
    expect(panelCss).not.toMatch(/(^|\n)\.fx-panel\s*\{/);
    expect(panelCss).not.toMatch(/(^|\n)\.fx-panel-content\s*\{/);
    expect(panelCss).toContain('.fx-panel-header');
  });

  test.each([
    '../SlotDebugOverlay/SlotDebugOverlay.tsx',
    '../SlotDebugOverlay/hashHue.ts',
    '../SlotDebugOverlay/isSlotDebugEnabled.ts',
    '../SlotDebugOverlay/index.ts',
  ])('%s remains a slot-diagnostic compatibility re-export', (relativePath) => {
    const source = readSource(relativePath);

    expect(source).toContain("from '@forgeax/app-shell/react'");
    expect(source).not.toMatch(/\b(?:const|function|class|interface)\s+\w+/);
  });

  test('Interface App consumes slot diagnostics from App Shell directly', () => {
    const app = readSource('../../App.tsx');

    expect(app).toContain("from '@forgeax/app-shell/react'");
    expect(app).not.toContain("from './components/SlotDebugOverlay'");
  });

  test('the legacy resize path remains a compatibility re-export without a local implementation', () => {
    const source = readSource('../Resize/ResizeHandle.tsx');

    expect(source).toContain("from '@forgeax/app-shell/react'");
    expect(source).not.toMatch(/\b(?:const|function|class|interface)\s+\w+/);
  });

  test('generic resize presentation belongs to App Shell', () => {
    const css = readSource('../../App.css');

    expect(css).toContain("@import '@forgeax/app-shell/resize.css';");
    expect(css).not.toMatch(/(^|\n)\.resize-handle\s*\{/);
    expect(css).not.toMatch(/(^|\n)\.resize-handle-(?:col|row)\s*\{/);
    expect(css).toContain('.studio-shell[data-fullscreen="1"] > .studio-body > .resize-handle-col');
  });

  test('DockRegion directly composes App Shell handles for product-owned shell widths', () => {
    const dockRegion = readSource('./DockRegion.tsx');

    expect(dockRegion).toContain("import { ResizeHandle } from '@forgeax/app-shell/react'");
    expect(dockRegion).not.toContain("from './AuxBarResizer'");
    expect(dockRegion).not.toContain("from './ChatDockResizer'");
    expect(dockRegion).toContain('className="fx-auxbar-resizer"');
    expect(dockRegion).toContain('className="fx-chat-resizer"');
    expect(dockRegion).toContain("document.body.classList.add('fx-auxbar-resizing')");
    expect(dockRegion).toContain("document.body.classList.remove('fx-auxbar-resizing')");
    expect(dockRegion).toContain("document.body.classList.add('fx-chat-resizing')");
    expect(dockRegion).toContain("document.body.classList.remove('fx-chat-resizing')");
    expect(dockRegion.match(/beginAnchoredResize\(use\w+Width\.getState\(\)\.width\)/g)).toHaveLength(2);
    expect(dockRegion.match(/setWidth\(applyAnchoredResizeDelta\(/g)).toHaveLength(2);
  });

  test('DockRegion and product commands consume public dock state adapters', () => {
    const dockRegion = readSource('./DockRegion.tsx');
    const commands = readSource('../../core/extensions/builtin-commands.ts');
    const menus = readSource('../../core/extensions/builtin-menus.ts');

    expect(dockRegion).toContain("from '@forgeax/app-shell/dock'");
    expect(dockRegion).toContain('hasMountedPanelPlacement');
    expect(dockRegion).toContain('pruneSerializedDockLayout');
    expect(dockRegion).toContain('installDockPanelVisibilityTracking');
    expect(dockRegion).toContain('createDockPanelCommands');
    expect(dockRegion).toContain('scopeTransition.getCurrent()?.layout');
    expect(dockRegion).not.toContain("from './reopen-position'");
    expect(dockRegion).not.toContain('const visiblePanelIds');
    expect(dockRegion).not.toContain('export function isPanelVisible');
    expect(commands).toContain("import { isDockPanelVisible } from '@forgeax/app-shell/dock'");
    expect(menus).toContain("import { isDockPanelVisible } from '@forgeax/app-shell/dock'");
    expect(commands).not.toContain("from '../../components/DockShell/DockRegion'");
    expect(menus).not.toContain("from '../../components/DockShell/DockRegion'");
  });

  test('DockRegion delegates visibility lease lifecycle while retaining ChatDock UI state', () => {
    const dockRegion = readSource('./DockRegion.tsx');

    expect(dockRegion).toContain('installDockPanelVisibilityTracking(api, {');
    expect(dockRegion).toContain("onAdded: (id) => { if (region === 'ChatDock' && id === 'chat') setChatMounted(true); }");
    expect(dockRegion).toContain("onRemoved: (id) => { if (region === 'ChatDock' && id === 'chat') setChatMounted(false); }");
    expect(dockRegion).not.toContain('visibilityReleases');
    expect(dockRegion).not.toContain('trackDockPanelVisibility');
  });

  test('DockRegion delegates ready-session teardown while retaining concrete adapter order', () => {
    const dockRegion = readSource('./DockRegion.tsx');

    expect(dockRegion).toContain('createDockReadyActivation<DockviewApi>()');
    expect(dockRegion).toContain('const activated = readyActivation.replace(api, [');
    expect(dockRegion).toContain('() => registerDockviewApi(api)');
    expect(dockRegion).toContain('() => registerDockRegion(');
    expect(dockRegion).toContain('() => installDockPanelVisibilityTracking(api, {');
    expect(dockRegion).toContain('getTabContextMenuItems={getTabContextMenuItems}');
    expect(dockRegion).not.toContain('installDockOverlayHost');
    expect(dockRegion).toContain('() => installEdgeDrawer(api, wrap)');
    expect(dockRegion).toContain('() => installUeDockDrag(api, wrap, {');
    expect(dockRegion).toContain('createDockScopeTransition<ActivePageScope, DockviewApi>');
    expect(dockRegion).toContain('if (activated) scopeTransition.applyCurrent()');
    expect(dockRegion).toContain('scopeTransition.transition(pageScope)');
    expect(dockRegion).toContain('scopeTransition.getCurrent()');
    expect(dockRegion).toContain('readyActivation.getCurrent()');
    expect(dockRegion).toContain('readyActivation.dispose()');
    expect(dockRegion).not.toContain('readyGenerationRef');
    expect(dockRegion).not.toContain('readySessionRef');
    expect(dockRegion).not.toContain('apiRef.current');
    expect(dockRegion).not.toContain('currentScopeRef');
    expect(dockRegion).not.toContain('replaceDockReadyAdapters');
    expect(dockRegion).not.toContain('createDockReadyCleanup');
    expect(dockRegion).not.toContain('readyCleanup.add(');
    expect(dockRegion).not.toContain('cleanupRef');
    expect(dockRegion).not.toContain('.splice(0).reverse()');
  });

  test('DockRegion delegates panel command lifecycle while retaining product bus policy', () => {
    const region = readSource('./DockRegion.tsx');

    expect(region).toContain('createDockPanelCommands');
    expect(region).toContain("host.bus.on('panel:open'");
    expect(region).toContain('isMemberRef.current(id)');
    expect(region).not.toContain('designedDockPanelPosition(');
  });

  test('DockRegion delegates layout persistence lifecycle while retaining product keys and Dockview policy', () => {
    const dockRegion = readSource('./DockRegion.tsx');

    expect(dockRegion).toContain('createDockLayoutPersistence');
    expect(dockRegion).toContain('layoutPersistence.captureAndSave');
    expect(dockRegion).toContain('() => api.toJSON()');
    expect(dockRegion).toContain('pageLayoutStore.load(key, identity)');
    expect(dockRegion).toContain('pageLayoutStore.save(key, identity, layout)');
    expect(dockRegion).toContain('pageLayoutStore.remove(key)');
    expect(dockRegion).toContain('forgeax:project:');
    expect(dockRegion).toContain('pruneSerializedDockLayout');
    expect(dockRegion).not.toContain('suppressLayoutSaveRef');
  });

  test('window lifecycle carriers are public while Interface keeps runtime, URL and native adapter policy', () => {
    const surface = readSource('../../lib/platform/surface.ts');
    const windowManager = readSource('../../lib/platform/window-manager.ts');
    const pageTypes = readSource('../../core/page-platform/types.ts');

    expect(surface).toContain("from '@forgeax/app-shell/window'");
    expect(surface).not.toContain('function surfaceKey');
    expect(surface).not.toContain('function surfaceWindowLabel');
    expect(surface).not.toContain('function encodeSurfaceQuery');
    expect(surface).not.toContain('function decodeSurfaceFromLocation');
    expect(surface).toContain('export function encodeSurfaceWindowQuery');
    expect(surface).toContain('export function surfaceWindowUrl');
    expect(windowManager).toContain("from '@forgeax/app-shell/window'");
    expect(windowManager).toContain('createBrowserWindowManager({');
    expect(windowManager).toContain('createExternalWindowManager({');
    expect(windowManager).toContain('loadHost: loadTauriWindowHost');
    expect(windowManager).toContain("encodeSurfaceWindowQuery(d, 'browser-page')");
    expect(windowManager).toContain("surfaceWindowUrl(surface, 'tauri-webview')");
    expect(windowManager).not.toContain('window.open(');
    expect(windowManager).not.toContain('new Map<string, Window>');
    expect(windowManager).not.toContain('setInterval(');
    expect(windowManager).not.toContain('const closeListeners');
    expect(windowManager).not.toContain('function notifyClosed');
    expect(windowManager).not.toContain('function createTauriWindowManager');
    expect(windowManager).not.toContain('export interface WindowManager');
    expect(windowManager).not.toContain('export interface DetachWindowOptions');
    expect(pageTypes).toContain("from '@forgeax/app-shell/window'");
  });

  test('dock-panel window transactions use the public instance-scoped controller', () => {
    const panelWindowing = readSource('./panelWindowing.ts');

    expect(panelWindowing).toContain('createPanelWindowingController');
    expect(panelWindowing).toContain('panelWindowing.openPanelWindow');
    expect(panelWindowing).toContain('panelWindowing.panelForClosedSurface');
    expect(panelWindowing).not.toContain('new Map');
    expect(panelWindowing).not.toContain('queueMicrotask');
    expect(panelWindowing).not.toContain('surfaceKey(');
  });

  test('surface floating state and redock orchestration belong to App Shell', () => {
    const shellState = readSource('../../store-parts/shell.ts');
    const store = readSource('../../store.ts');
    const platform = readSource('../../lib/platform/surface-windowing.ts');

    expect(platform).toContain('createSurfaceWindowingController({');
    expect(platform).toContain('beforeDetach:');
    expect(shellState).toContain('getSurfaceWindowingController().detachSurface');
    expect(shellState).toContain('getSurfaceWindowingController().redockSurface');
    expect(shellState).not.toContain('floatingSurfaces: {}');
    expect(shellState).not.toContain('markSurfaceDocked:');
    expect(store).not.toContain('floatingSurfaces: Record<string, true>');
    expect(store).not.toContain('markSurfaceDocked:');
  });

  test('edge pin state belongs to App Shell while Interface keeps Dockview wiring', () => {
    const pinAdapter = readSource('./edgePinStore.ts');

    expect(pinAdapter).toContain('createEdgePinStore()');
    expect(pinAdapter).not.toContain('new Map<');
    expect(pinAdapter).not.toContain('new Set<');
    expect(pinAdapter).toContain("EDGE_PIN_CLASS = 'fx-edge-pin'");
  });

  test('detached panel presentation delegates to the public boundary', () => {
    const boundary = readSource('./PanelWindowingBoundary.tsx');

    expect(boundary).toContain('DetachedPanelBoundary');
    expect(boundary).toContain("from '@forgeax/app-shell/react'");
    expect(boundary).toContain('<DetachedPanelBoundary');
    expect(boundary).toContain('floatingSurfaces={floatingSurfaces}');
    expect(boundary).not.toContain('capability.createTarget()');
    expect(boundary).not.toContain('shouldShowDetachedPlaceholder');
  });

  test('detached surface framing delegates to App Shell while product routing stays local', () => {
    const surface = readSource('../DetachedSurface.tsx');
    const appCss = readSource('../../App.css');
    const globalCss = readSource('../../styles/global.css');

    expect(surface).toContain('DetachedSurfaceStatus');
    expect(surface).toContain('<DetachedSurfaceFrame panel>');
    expect(surface).toContain('<DetachedSurfaceFrame centered>');
    expect(surface).toContain('<DetachedSurfaceStatus tone="error">');
    expect(surface).not.toContain("style={{ color: '#888' }}");
    expect(surface).not.toContain("style={{ color: '#c44' }}");
    expect(surface).toContain('switch (surface.id)');
    expect(surface).toContain('useExtensionManifest(surface.id)');
    expect(surface).not.toContain('const fill:');
    expect(surface).not.toContain('const fillCenter:');
    expect(appCss).toContain("@import '@forgeax/app-shell/detached.css';");
    expect(globalCss).not.toContain('.fx-detached-surface');
    expect(globalCss).not.toContain('.fx-detached-panel');
  });

  test('generic surface placeholder markup belongs to App Shell', () => {
    const owners = [
      readSource('../DetachedSurface.tsx'),
      readSource('./PanelWindowingBoundary.tsx'),
      readSource('../Surfaces/SurfaceKeepAliveLayer.tsx'),
      readSource('./panelRegistry.tsx'),
    ];

    for (const owner of owners) {
      expect(owner).toContain('SurfacePlaceholder');
      expect(owner).not.toContain('<div className="surface-placeholder">');
      expect(owner).not.toContain('<div className="surface-placeholder-title">');
    }
  });

  test('generic surface region markup and fill presentation belong to App Shell', () => {
    const appCss = readSource('../../App.css');
    const mainAreaCss = readSource('../MainArea/MainArea.css');
    const owners = [
      readSource('../MainArea/SurfacePanels.tsx'),
      readSource('../DetachedSurface.tsx'),
      readSource('../Surfaces/SurfaceKeepAliveLayer.tsx'),
    ];

    expect(appCss).toContain("@import '@forgeax/app-shell/surface.css';");
    expect(mainAreaCss).not.toMatch(/(^|\n)\.surface-region\s*\{/);
    expect(mainAreaCss).not.toContain('.surface-region > :not(.preview-fatal-banner)');
    for (const owner of owners) {
      expect(owner).toContain('SurfaceRegion');
      expect(owner).not.toContain('className="surface-region"');
      expect(owner).not.toContain('surface-region"');
    }
  });

  test('keep-alive floating state comes from the public windowing controller', () => {
    const keepAlive = readSource('../Surfaces/SurfaceKeepAliveLayer.tsx');

    expect(keepAlive).toContain('useFloatingSurfaces');
    expect(keepAlive).not.toContain('useShellStore');
    expect(keepAlive).not.toContain('state.floatingSurfaces');
  });

  test('generic unavailable-panel markup and presentation belong to App Shell', () => {
    const panelShell = readSource('../PanelShell/PanelShell.tsx');
    const panelCss = readSource('../PanelShell/PanelShell.css');

    expect(panelShell).toContain('PanelEmptyState');
    expect(panelShell).toContain('data-panel={id}');
    expect(panelShell).toContain('data-panel-unmounted="1"');
    expect(panelShell).not.toContain('<div className="fx-panel-empty"');
    expect(panelShell).not.toContain('<div className="fx-panel-empty-title"');
    expect(panelShell).not.toContain('<div className="fx-panel-empty-detail"');
    expect(panelCss).not.toMatch(/(^|\n)\.fx-panel-empty\s*\{/);
    expect(panelCss).not.toMatch(/(^|\n)\.fx-panel-empty-title\s*\{/);
    expect(panelCss).not.toMatch(/(^|\n)\.fx-panel-empty-detail\s*\{/);
  });

  test('product resizer skins neutralize the generic gutter margin', () => {
    const appCss = readSource('../../App.css');
    const dockCss = readSource('./DockShell.css');

    expect(appCss.match(/\.fx-chat-resizer\s*\{[^}]*margin:\s*0;/s)).not.toBeNull();
    expect(dockCss.match(/\.fx-auxbar-resizer\s*\{[^}]*margin:\s*0;/s)).not.toBeNull();
    expect(appCss.match(/\.resize-handle\.fx-chat-resizer::after\s*\{[^}]*content:\s*none;/s)).not.toBeNull();
    expect(dockCss.match(/\.resize-handle\.fx-auxbar-resizer::after\s*\{[^}]*content:\s*none;/s)).not.toBeNull();
  });
});
