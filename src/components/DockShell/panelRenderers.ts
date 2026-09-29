// Compatibility consumers share the AppShell renderer context identity.

export type {
	CreateExtensionPort,
	CreateExtensionPortOptions,
	CreateWindowTransport,
	EditorAssetImportSourceHandler,
	EditorAssetImportSourceRequest,
	EditorContextMenuItem,
	ExtensionPort,
	ExtensionToolCall,
	ExtensionToolResult,
	ExtensionTransport,
	PanelDescriptor,
	PanelRenderers,
	WindowTransportOptions,
} from "@forgeax/app-shell/application";

export {
	DEFAULT_EDITOR_PANEL_IDS,
	DEFAULT_PANEL_RENDERERS,
	PanelRenderersProvider,
	usePanelRenderers,
} from "@forgeax/app-shell/application";
