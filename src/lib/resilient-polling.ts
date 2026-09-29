export type ExtensionStatusKind = "model-binding" | "skill" | "tool" | "agent";
export type ExtensionKindCounts = Record<
	ExtensionStatusKind,
	{ count: number; ids: string[] }
>;

export function deriveExtensionKindCounts(
	items: readonly { id: string; kind: string }[],
): ExtensionKindCounts {
	const result: ExtensionKindCounts = {
		"model-binding": { count: 0, ids: [] },
		skill: { count: 0, ids: [] },
		tool: { count: 0, ids: [] },
		agent: { count: 0, ids: [] },
	};
	for (const item of items) {
		if (!(item.kind in result)) continue;
		const row = result[item.kind as ExtensionStatusKind];
		row.count += 1;
		row.ids.push(item.id);
	}
	return result;
}
