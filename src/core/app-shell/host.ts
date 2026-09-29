import { createApplicationHost } from "@forgeax/app-shell/application";
import { createPageServices as createSharedPageServices } from "@forgeax/app-shell/pages";
import type { SerializedDockview } from "dockview";
import {
	DEFAULT_PANEL_RENDERERS,
	type PanelRenderers,
} from "../../components/DockShell/panelRenderers";
import {
	getCurrentProject,
	subscribeCurrentProject,
} from "../../lib/project-context";
import type { CapabilityRegistry } from "../extension-foundation/capabilities";
import type { CommandsRegistry } from "../extension-foundation/commands";
import type { Cleanup } from "../extension-foundation/types";
import type { PagePlatformContribution } from "../page-platform";
import type {
	PanelActionContribution,
	PanelControlContribution,
} from "../panels";
import { consoleLogger } from "./logger";
import type {
	AppBusEventMap,
	AppExtension,
	AppHost,
	AppLogger,
	HostCapability,
} from "./types";

export interface CreateAppHostDeps {
	readonly log?: AppLogger;
	readonly initialPanels?: PanelRenderers;
	readonly createPageServices?: typeof createPageServices;
}

export interface AppHostControl {
	beginSetup(manifest: AppExtension): void;
	endSetup(): void;
	removeExtensionsByOwner(ownerId: string): void;
	readonly capabilities: CapabilityRegistry<HostCapability>;
	/** ADR 0025 M2 — the contribution channel behind host.panels. Owner-tagged;
	 *  the returned Cleanup removes exactly this batch (snapshot re-folds). */
	contributePanels(owner: string, patch: Partial<PanelRenderers>): Cleanup;
	contributePanelActions(
		owner: string,
		actions: readonly PanelActionContribution[],
	): Cleanup;
	contributePanelControls(
		owner: string,
		controls: readonly PanelControlContribution[],
	): Cleanup;
	contributePagePlatform(
		owner: string,
		contribution: PagePlatformContribution,
	): Cleanup;
	/** Coarse change signal for the derived panels snapshot (React subscribes
	 *  via useSyncExternalStore in App.tsx). */
	onPanelsChange(listener: () => void): () => void;
	dispose(): Promise<void>;
}

export interface CreateAppHostResult {
	host: AppHost;
	control: AppHostControl;
}

/** Compatibility assembly retains the existing product page authority. */
export function createAppHost(
	deps: CreateAppHostDeps = {},
): CreateAppHostResult {
	return createApplicationHost<
		PanelRenderers,
		ReturnType<typeof createPageServices>,
		AppBusEventMap,
		PanelActionContribution
	>({
		log: deps.log ?? consoleLogger,
		defaultPanels: DEFAULT_PANEL_RENDERERS,
		initialPanels: deps.initialPanels,
		createPageServices: deps.createPageServices ?? createPageServices,
	});
}

function createPageServices(commands: CommandsRegistry) {
	return createSharedPageServices<SerializedDockview>(commands, {
		getCurrentProject,
		subscribeCurrentProject,
	});
}
