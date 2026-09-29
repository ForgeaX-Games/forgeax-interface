// Thin re-export shell — implementation lives in
// @forgeax/extension-platform (ADR 0026).

export type { ExtensionLoaderOptions } from "@forgeax/extension-platform/extensions";
export {
	createExtensionLoader,
	ExtensionLoader,
} from "@forgeax/extension-platform/extensions";
