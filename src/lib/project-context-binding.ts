import type { PageProjectContext } from "@forgeax/app-shell/pages";
export interface ApplicationProjectContext extends PageProjectContext {
	setCurrentProject(projectId: string): void;
}

/** Select before first use so page sessions, layouts and setters retain one owner. */
export function createProjectContextBinding(
	fallback: ApplicationProjectContext,
) {
	let active = fallback;
	let configured: ApplicationProjectContext | undefined;
	let used = false;
	const read = () => {
		used = true;
		return active;
	};
	return {
		configure(next: ApplicationProjectContext) {
			if (next === configured) return;
			if (used || configured)
				throw new Error(
					"Project context must be configured once before first use",
				);
			configured = next;
			active = next;
		},
		context: {
			getCurrentProject: () => read().getCurrentProject(),
			setCurrentProject: (projectId: string) =>
				read().setCurrentProject(projectId),
			subscribeCurrentProject: (listener: (projectId: string) => void) =>
				read().subscribeCurrentProject(listener),
		},
	};
}
