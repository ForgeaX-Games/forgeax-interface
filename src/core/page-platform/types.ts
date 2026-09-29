import type * as SharedPages from "@forgeax/app-shell/pages";
import type { SerializedDockview } from "dockview";

export type {
	ActivityLocalizedText,
	ActivityRegistration,
	ActivityRegistry,
	ActivityRegistrySnapshot,
	PageCloseDecision,
	PageClosePreparation,
	PageCloseReason,
	PageCloseRequest,
	PageController,
	PageControllerContext,
	PageInstance,
	PageMenuItem,
	PageOpenRequest,
	PagePanelPlacement,
	PagePlatformErrorCode,
	PagePort,
	PageSessionSnapshot,
	PanelRenderContext,
	PanelRuntime,
	PanelTypeRegistration,
	ResolvedPanelPlacement,
	ResourceEditorRegistration,
	ResourceEditorResolver,
} from "@forgeax/app-shell/pages";
export { PagePlatformError } from "@forgeax/app-shell/pages";
export type PageTypeRegistration =
	SharedPages.PageTypeRegistration<SerializedDockview>;
export type PagePlatformContribution =
	SharedPages.PagePlatformContribution<SerializedDockview>;
export type ResolvedPageType = SharedPages.ResolvedPageType<SerializedDockview>;
export type PageRegistrySnapshot =
	SharedPages.PageRegistrySnapshot<SerializedDockview>;
export type PageRegistry = SharedPages.PageRegistry<SerializedDockview>;
