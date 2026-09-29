// Thin re-export shell — implementation lives in
// @forgeax/extension-platform (ADR 0026).

export type { CapabilityEventName } from "@forgeax/extension-platform/platform";
export {
	CapabilityRegistry,
	createCapabilityRegistry,
} from "@forgeax/extension-platform/platform";
