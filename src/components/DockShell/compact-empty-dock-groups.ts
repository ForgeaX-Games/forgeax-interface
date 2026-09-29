/** Remove grid/floating groups that lost all panels (e.g. after UE lift/drop). */

export interface CompactEmptyDockGroupsApi {
	readonly groups: ReadonlyArray<{
		readonly panels: readonly unknown[];
		readonly api: { readonly location: { readonly type: string } };
	}>;
	removeGroup(group: CompactEmptyDockGroupsApi["groups"][number]): void;
}

export function compactEmptyDockGroups(api: CompactEmptyDockGroupsApi): number {
	const empty = api.groups.filter(
		(group) =>
			group.panels.length === 0 &&
			(group.api.location.type === "grid" ||
				group.api.location.type === "floating"),
	);
	for (const group of empty) {
		try {
			api.removeGroup(group);
		} catch {
			// Group may already be mid-disposal from dockview's own move path.
		}
	}
	return empty.length;
}

export function relayoutDockContainer(
	api: { layout?(width: number, height: number, force?: boolean): void },
	container: HTMLElement | null | undefined,
): void {
	if (!container) return;
	const width = container.clientWidth;
	const height = container.clientHeight;
	if (width <= 0 || height <= 0) return;
	try {
		api.layout?.(width, height, true);
	} catch {
		// noop — region may be unmounting.
	}
}
