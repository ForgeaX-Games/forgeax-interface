import { t } from "./i18n";
import { createCompatibilityShellStore } from "./store-compatibility";
import type { ChatTab } from "./store-contract";
import { createShellStoreBinding } from "./store-parts/runtime-binding";

export type * from "./store-contract";
export {
	type ActiveProjectSelection,
	type AgentCatalogClient,
	type AgentCatalogEntry,
	type AgentCatalogResponse,
	type AndroidConfig,
	type BuildHistoryRecord,
	type BuildJobStatus,
	type BuildProjectOptions,
	type CleanBuildResult,
	configureStudioDomainClients,
	type EngineRootCandidate,
	getAgentCatalogClient,
	getStudioBuildClient,
	getStudioProjectClient,
	hasStudioDomainClients,
	type ProjectRow,
	type RuntimeAssetBinding,
	type RuntimeAssetDiagnostic,
	type RuntimeCatalogRoot,
	type RuntimeScopeState,
	type StudioBuildClient,
	type StudioDomainClients,
	type StudioProjectClient,
} from "./store-parts/domain-clients";
export {
	configureSessionClient,
	type SessionClient,
} from "./store-parts/session-client";

/** UI label fallback for a tab whose server-side displayName is undefined.
 *  Single helper so all surfaces (TabStrip / SessionSwitcher / TopBar) render
 *  the same string and we never reintroduce a hardcoded "default" anywhere. */
export function tabLabel(tab: Pick<ChatTab, "sid" | "displayName">): string {
	const n = tab.displayName?.trim();
	return n && n.length > 0 ? n : t("sessionTabs.untitled");
}

const binding = createShellStoreBinding(createCompatibilityShellStore);

/** Select once before the first store read or subscription. */
export const configureApplicationShellStore = binding.configure;
export const useShellStore = binding.store;
export const useAppStore = useShellStore;
