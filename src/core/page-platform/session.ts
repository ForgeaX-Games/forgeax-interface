import {
	createPageSession as createSharedPageSession,
	type CreatePageSessionOptions as SharedOptions,
} from "@forgeax/app-shell/pages";
import {
	getCurrentProject,
	subscribeCurrentProject,
} from "../../lib/project-context";
import type { PageRegistry } from "./types";

export {
	PageClosePreparationDeferredError,
	type PageSession,
} from "@forgeax/app-shell/pages";
export type CreatePageSessionOptions = Omit<SharedOptions, "project">;
export function createPageSession(
	registry: PageRegistry,
	options: CreatePageSessionOptions = {},
) {
	return createSharedPageSession(registry, {
		...options,
		project: { getCurrentProject, subscribeCurrentProject },
	});
}
