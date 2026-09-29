// packages/interface/src/appHostBootstrap.ts
//
// The single place that builds an AppHost + wires the built-in extension list.
// Studio (which injects Dashboard / Settings / StatusFeeds / surfaces / slots /
// detached / editor concrete extensions) calls this and passes them via
// `overrides.extensions`. Interface-alone callers pass no overrides — no overlays,
// no detached windows, and no editor-specific panels show up (only the interface foundation +
// chat remain).
//
// App Shell adapts these application declarations to the Extension Platform
// loader, including setup ownership and page-close cleanup barriers. Product
// selection and catalog/host lifetime remain in this composition entry.

import { createApplicationExtensionLoader } from "@forgeax/app-shell/application";
import {
	type AppExtension,
	type AppExtensionContext,
	type AppExtensionContributes,
	type AppHost,
	type AppHostControl,
	type CreateAppHostDeps,
	createAppHost,
} from "./core/app-shell";
import { builtinCommandsExtension } from "./core/extensions/builtin-commands";
import { builtinMenusExtension } from "./core/extensions/builtin-menus";
import { chromeDrawerExtension } from "./core/extensions/chrome-drawer";
import { chromeStatusBarExtension } from "./core/extensions/chrome-statusbar";
import { foundationBusExtension } from "./core/extensions/foundation-bus";
import { foundationCommandsExtension } from "./core/extensions/foundation-commands";
import { foundationStorageExtension } from "./core/extensions/foundation-storage";
import { hostCommandsExtension } from "./core/extensions/host-commands";
import { panelsChatExtension } from "./core/extensions/panels-chat";
import { panelsViewportExtension } from "./core/extensions/panels-viewport";
import "./core/extensions/session-client.d"; // side-effect: AppHost.session type augmentation
import { sessionClientExtension } from "./core/extensions/session-client";
import "./core/extensions/studio-domain-clients.d";
import { studioDomainClientsExtension } from "./core/extensions/studio-domain-clients";
import "./core/extensions/observability.d"; // side-effect: AppHost.observability type augmentation
import { createCatalogPageExtensionRuntime } from "./core/app-shell/catalog-page-extensions";
import { consoleLogger } from "./core/app-shell/logger";
import { observabilityExtension } from "./core/extensions/observability";
import { trajectoryExtension } from "./core/extensions/trajectory";

export interface AppHostBootstrapOverrides
	extends Pick<CreateAppHostDeps, "createPageServices"> {
	/** Studio injects dashboard / settings / surfaces / slots / detached /
	 *  editor concrete plugins here. Appended AFTER the built-in list so they
	 *  can depend on foundation capabilities. */
	readonly extensions?: readonly AppExtension[];
}

export interface AppHostBootstrapResult {
	host: AppHost;
	control: AppHostControl;
	/** Begins terminal shutdown. A rejection may follow successful owner cleanup:
	 * the runtime is not safe to resume using and disposal is not atomic. Resolve
	 * an explicit cleanup deferral and retry dispose to finish remaining owners;
	 * already retired owners are not restored or cleaned up again. */
	dispose: () => Promise<void>;
}

export async function bootstrapAppHost(
	overrides: AppHostBootstrapOverrides = {},
): Promise<AppHostBootstrapResult> {
	const { host, control } = createAppHost({
		createPageServices: overrides.createPageServices,
	});

	const loader = createApplicationExtensionLoader<
		AppExtensionContext,
		AppExtensionContributes
	>({
		menus: host.menus,
		contextFactory: (manifest) => ({
			host,
			bus: host.bus,
			storage: host.storage,
			log: consoleLogger,
			registerCommand: (command) => host.commands.register(command),
			contributePanels: (patch) => control.contributePanels(manifest.id, patch),
			contributePanelActions: (actions) =>
				control.contributePanelActions(manifest.id, actions),
			contributePanelControls: (controls) =>
				control.contributePanelControls(manifest.id, controls),
			contributePagePlatform: (contribution) =>
				control.contributePagePlatform(manifest.id, contribution),
		}),
		control,
		log: consoleLogger,
	});

	const overrideIds = new Set(
		(overrides.extensions ?? []).map((extension) => extension.id),
	);
	const manifests = [
		foundationCommandsExtension,
		foundationBusExtension,
		foundationStorageExtension,
		builtinCommandsExtension,
		hostCommandsExtension,
		builtinMenusExtension,
		panelsViewportExtension,
		panelsChatExtension,
		chromeStatusBarExtension,
		chromeDrawerExtension,
		sessionClientExtension,
		studioDomainClientsExtension,
		observabilityExtension,
		trajectoryExtension,
		...(overrides.extensions ?? []),
	];

	// Fail-fast(架构原则 §5):loader 按 id 去重是「先声明者胜」的静默行为,
	// override 扩展若与内置清单撞 id 会被无声跳过(2026-07-21 studio
	// 'panels.chat' 撞 panelsChatExtension,面板 Panel not mounted 的根因)。
	// 这里显式告警,让撞车当场现形。
	{
		const seen = new Set<string>();
		for (const m of manifests) {
			if (seen.has(m.id)) {
				consoleLogger.warn(
					`[appHostBootstrap] duplicate extension id "${m.id}" — later declaration is silently SKIPPED by the loader; rename one side`,
				);
			}
			seen.add(m.id);
		}
	}

	await loader.load(manifests);
	await loader.flush();
	const catalogRuntime = createCatalogPageExtensionRuntime({
		control,
		overriddenIds: overrideIds,
	});
	await catalogRuntime.start();

	const dispose = async (): Promise<void> => {
		await catalogRuntime.dispose();
		await loader.unload();
		await control.dispose();
	};

	return { host, control, dispose };
}
