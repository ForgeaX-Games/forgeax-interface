import { describe, expect, it } from "bun:test";
import { compactEmptyDockGroups } from "./compact-empty-dock-groups";

describe("compactEmptyDockGroups", () => {
	it("removes empty grid and floating groups but keeps edge groups", () => {
		const edge = {
			panels: [] as readonly unknown[],
			api: { location: { type: "edge" } },
		};
		const gridEmpty = {
			panels: [] as readonly unknown[],
			api: { location: { type: "grid" } },
		};
		const floatingEmpty = {
			panels: [] as readonly unknown[],
			api: { location: { type: "floating" } },
		};
		const gridLive = {
			panels: [{}],
			api: { location: { type: "grid" } },
		};
		const removed: unknown[] = [];
		const api = {
			groups: [edge, gridEmpty, floatingEmpty, gridLive],
			removeGroup(group: unknown) {
				removed.push(group);
			},
		};

		expect(compactEmptyDockGroups(api)).toBe(2);
		expect(removed).toEqual([gridEmpty, floatingEmpty]);
	});

	it("tolerates removeGroup failures", () => {
		const stale = {
			panels: [] as readonly unknown[],
			api: { location: { type: "grid" } },
		};
		const api = {
			groups: [stale],
			removeGroup() {
				throw new Error("already removed");
			},
		};

		expect(compactEmptyDockGroups(api)).toBe(1);
	});
});
