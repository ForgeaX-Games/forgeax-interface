// Thin re-export shell — implementation lives in
// @forgeax/extension-platform (ADR 0026).

export type {
	CommandDescriptor,
	CommandsRegistry,
} from "@forgeax/extension-platform/platform";
export { createCommandsRegistry } from "@forgeax/extension-platform/platform";
