import type {
	AppHost as ApplicationHost,
	ApplicationShortcut,
} from "@forgeax/app-shell/application";
import {
	ApplicationStartupCleanupError,
	createApplicationRuntimeOwner,
} from "@forgeax/app-shell/application";
import {
	ExtensionCleanupDeferredError,
	ExtensionUnloadDeferredError,
} from "@forgeax/extension-platform/extensions";
import {
	type AppHostBootstrapOverrides,
	type AppHostBootstrapResult,
	bootstrapAppHost,
} from "./appHostBootstrap";
import { bootStageAppMounted } from "./boot/driver";
import { PageClosePreparationDeferredError } from "./core/page-platform/session";
import {
	changeLanguage,
	configureLocaleRuntime,
	initI18n,
	type Locale,
} from "./i18n";
import type { ApplicationLocaleRuntimeFactory } from "./i18n/runtime";
import { toggleCommandPalette } from "./lib/command-palette-store";
import { configureComposerInsertRuntime } from "./lib/composer-bridge";
import type { ComposerInsertRuntimeFactory } from "./lib/composer-insert-runtime";
import { useShellStore } from "./store";

export type InterfaceApplicationRuntime = AppHostBootstrapResult & {
	readonly host: AppHostBootstrapResult["host"] & ApplicationHost;
	readonly shellShortcuts?: readonly ApplicationShortcut[];
};

export interface InterfaceApplicationStartupOptions {
	/** One page-lifetime locale authority, installed before any locale initialization. */
	readonly createLocaleRuntime?: ApplicationLocaleRuntimeFactory;
	/** Product definitions used by the existing router; omitted for compatibility callers. */
	readonly createShellShortcuts?: (context: {
		readonly host: ApplicationHost;
		readonly toggleCommandPalette: () => void;
	}) => readonly ApplicationShortcut[];
	/** Product-owned page-lifetime queue. Keep the factory stable across restarts. */
	readonly createComposerInsertRuntime?: ComposerInsertRuntimeFactory;
	/** Product-selected initial locale. Persisted locale remains authoritative when omitted. */
	readonly locale?: Locale;
}

/** Products retain this owner above their replaceable recovery/runtime subtree.
 * Only the explicit pre-destructive deferrals permit a user-requested retry. */
export function createInterfaceApplicationOwner() {
	return createApplicationRuntimeOwner({
		isCleanupDeferred: (error) =>
			error instanceof ExtensionCleanupDeferredError ||
			error instanceof ExtensionUnloadDeferredError ||
			error instanceof PageClosePreparationDeferredError,
	});
}

/**
 * Lets a product replace one shell overlay with its own destination. Interface
 * owns observation, clearing and synchronous reentry; the product owns routing.
 * Installation does not reconcile current state; subsequent store notifications
 * are observed. Product errors still propagate.
 */
export function installApplicationOverlayRedirect(
	overlayId: string,
	onRedirect: () => void,
): () => void {
	let redirecting = false;
	return useShellStore.subscribe((state) => {
		if (redirecting || state.activeOverlay !== overlayId) return;
		redirecting = true;
		try {
			useShellStore.getState().closeOverlay();
			onRedirect();
		} finally {
			redirecting = false;
		}
	});
}

/**
 * Starts the shared Interface application runtime without selecting a product
 * entry or product extensions. IDE and compatibility callers supply their own
 * assembly overrides and render the resulting shell themselves.
 */
export async function startInterfaceApplication(
	overrides: AppHostBootstrapOverrides = {},
	options: InterfaceApplicationStartupOptions = {},
): Promise<InterfaceApplicationRuntime> {
	// Locale is application-startup state: finish it synchronously before any
	// extension setup or shell render can observe a mixed-language first frame.
	configureLocaleRuntime(options.createLocaleRuntime);
	initI18n();
	if (options.locale !== undefined) changeLanguage(options.locale);
	configureComposerInsertRuntime(options.createComposerInsertRuntime);
	const runtime = await bootstrapAppHost(overrides);
	try {
		const shellShortcuts = options.createShellShortcuts?.({
			host: runtime.host,
			toggleCommandPalette,
		});
		if (shellShortcuts !== undefined)
			Object.assign(runtime, { shellShortcuts });
		bootStageAppMounted();
		return runtime as InterfaceApplicationRuntime;
	} catch (error) {
		try {
			await runtime.dispose();
		} catch (cleanupError) {
			// Transfer unfinished ownership instead of dropping the only disposer.
			throw new ApplicationStartupCleanupError(error, runtime, cleanupError);
		}
		throw error;
	}
}

// Compatibility assembly remains here while products own startup and recovery.
export {
	type AppHostBootstrapOverrides,
	bootstrapAppHost,
} from "./appHostBootstrap";
// Product-owned layout can select existing views without importing the
// compatibility ApplicationShell, keyboard, native-menu or onboarding assembly.
export { ActivityRail as ApplicationActivityRail } from "./components/ActivityRail/ActivityRail";
export {
	CHAT_DEFAULT_WIDTH as APPLICATION_CHAT_DEFAULT_WIDTH,
	chatWidthStore as applicationChatWidthStore,
} from "./components/ChatColumn/useChatWidth";
export { CommandPalette as ApplicationCommandPalette } from "./components/CommandPalette/CommandPalette";
export { ContextMenu as ApplicationContextMenu } from "./components/ContextMenu/ContextMenu";
export { DockRegion as ApplicationDockRegion } from "./components/DockShell/DockRegion";
export { ExtensionHostPanel as ApplicationExtensionHostPanel } from "./components/DockShell/ExtensionHostPanel";
export { isExtensionHostExtension as isApplicationExtensionHostExtension } from "./components/DockShell/extensionRuntime";
export { DrawerHostView as ApplicationDrawerHost } from "./components/Drawer/DrawerHostView";
export { PassiveFeedbackHost as ApplicationPassiveFeedbackHost } from "./components/Feedback/PassiveFeedback";
export { useFeedbackStore as applicationFeedbackStore } from "./components/Feedback/store";
// Existing shell views and state remain shared while products own registration.
export { ViewportPanel as ApplicationViewportPanel } from "./components/MainArea/SurfacePanels";
export {
	ApplicationOnboarding,
	openApplicationOnboarding,
} from "./components/Onboarding/ApplicationOnboarding";
export { ConnectModelPrompt as ApplicationConnectModelPrompt } from "./components/Onboarding/ConnectModelPrompt";
export { PageTabStrip as ApplicationPageTabStrip } from "./components/PageTabs/PageTabStrip";
export { pulseStatusItems as applicationPulseStatusItems } from "./components/StatusBar/feeds/PulseFeeds";
export { diagnosticsStatusItem as applicationDiagnosticsStatusItem } from "./components/StatusBar/footer/DiagnosticsPopover";
export { forgeaxBuildVersionStatusItem as applicationBuildVersionStatusItem } from "./components/StatusBar/footer/ForgeaxBuildPopover";
export { SurfaceKeepAliveLayer as ApplicationSurfaceKeepAliveLayer } from "./components/Surfaces/SurfaceKeepAliveLayer";
export { surfaceOverlayStatusItem as applicationSurfaceOverlayStatusItem } from "./components/Surfaces/SurfaceOverlay";
export { GameModalHost as ApplicationGameModalHost } from "./components/TopBar/GameSwitcher";
export { GameDirectoryModalHost as ApplicationProjectModalHost } from "./components/TopBar/ProjectSwitcher";
export { TopBar as ApplicationTopBar } from "./components/TopBar/TopBar";
export { createCatalogPageExtensionRuntime } from "./core/app-shell/catalog-page-extensions";
// Product assembly can select the existing compatibility implementations while
// retaining their real contribution context until those implementations migrate.
export { type AppHostControl, createAppHost } from "./core/app-shell/host";
export { consoleLogger as applicationLogger } from "./core/app-shell/logger";
export type {
	AppBusEventMap,
	AppExtension,
	AppExtensionContext,
	AppExtensionContributes,
} from "./core/app-shell/types";
export { builtinCommandsExtension } from "./core/extensions/builtin-commands";
export { builtinMenusExtension } from "./core/extensions/builtin-menus";
export { chromeDrawerExtension } from "./core/extensions/chrome-drawer";
export { chromeStatusBarExtension } from "./core/extensions/chrome-statusbar";
export { foundationBusExtension } from "./core/extensions/foundation-bus";
export { foundationCommandsExtension } from "./core/extensions/foundation-commands";
export { foundationStorageExtension } from "./core/extensions/foundation-storage";
export { hostCommandsExtension } from "./core/extensions/host-commands";
export { observabilityExtension } from "./core/extensions/observability";
export { panelsChatExtension } from "./core/extensions/panels-chat";
export { panelsViewportExtension } from "./core/extensions/panels-viewport";
export { sessionClientExtension } from "./core/extensions/session-client";
export { studioDomainClientsExtension } from "./core/extensions/studio-domain-clients";
export { trajectoryExtension } from "./core/extensions/trajectory";
// Product entry can bind before its first locale-aware render or composition setup.
export { configureLocaleRuntime as configureApplicationLocaleRuntime } from "./i18n";
export { toggleCommandPalette } from "./lib/command-palette-store";
export { configureComposerInsertRuntime } from "./lib/composer-bridge";
export { DialogHost as ApplicationDialogHost } from "./lib/dialog";
export { configureApplicationProjectContext } from "./lib/project-context";
// Keep the same recent-project cache while products own native menu lifetime.
export {
	configureRecentProjectsRuntime as configureApplicationRecentProjectsRuntime,
	getRecentGames as getApplicationRecentGames,
	warmRecentGames as warmApplicationMenus,
} from "./lib/recent-games";
export {
	installStudioBootTraceProbe,
	studioBootTrace,
} from "./lib/studio-boot-trace";
export { executeFocusedTextEditAction as executeApplicationTextEditAction } from "./lib/text-edit-actions";
export {
	bootUiBridge as bootApplicationUiActionBridge,
	configureUiActionBridge as configureApplicationUiActionBridge,
} from "./lib/ui-bridge";
export { configureTrajectoryRuntime as configureApplicationTrajectoryRuntime } from "./lib/ui-trajectory";
export { configureApplicationShellStore } from "./store";
// Product boot injects the existing domain authority without importing store
// internals. This is the same configuration function, not another client registry.
export {
	configureStudioDomainClientRuntime,
	configureStudioDomainClients,
	type StudioDomainClients,
} from "./store-parts/domain-clients";
export type {
	ApplicationShellStore,
	ApplicationShellStoreFactory,
} from "./store-parts/runtime-binding";
export {
	type ApplicationShellStoreContext,
	createApplicationShellStoreContext,
} from "./store-parts/runtime-context";
export { configureSessionClientRuntime } from "./store-parts/session-client";
