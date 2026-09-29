import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createAppHost, HostProvider } from "../../core/app-shell";
import type { StatusItemContribution } from "../../core/panels";
import { PanelRenderersProvider } from "../DockShell/panelRenderers";
import { StripHostView } from "./StripHostView";

const restorers: (() => void)[] = [];
afterEach(() => {
	cleanup();
	for (const restore of restorers.splice(0).reverse()) restore();
});

function fixture() {
	const intervals: {
		callback: () => void;
		handle: number;
		cleared: boolean;
	}[] = [];
	const originalSet = globalThis.setInterval;
	const originalClear = globalThis.clearInterval;
	let failClear = false;
	const set = spyOn(globalThis, "setInterval").mockImplementation(((
		callback: () => void,
		delay?: number,
		...args: unknown[]
	) => {
		if (delay !== 4000) return originalSet(callback, delay, ...args);
		const handle = 940_000 + intervals.length;
		intervals.push({ callback, handle, cleared: false });
		return handle;
	}) as typeof setInterval);
	const clear = spyOn(globalThis, "clearInterval").mockImplementation(
		(handle) => {
			const interval = intervals.find(
				(candidate) => candidate.handle === Number(handle),
			);
			if (!interval) {
				originalClear(handle);
				return;
			}
			interval.cleared = true;
			if (failClear) throw new Error("host interval cleanup failed");
		},
	);
	restorers.push(() => {
		set.mockRestore();
		clear.mockRestore();
	});
	const stripItems: Record<string, StatusItemContribution> = {};
	for (const [slot, prefix, count] of [
		["left", "l", 6],
		["center", "c", 3],
		["right", "r", 7],
	] as const) {
		for (let i = count; i > 0; i--) {
			const id = `${prefix}${i}`;
			stripItems[id] = {
				id,
				location: `statusbar.${slot}`,
				priority: count - i,
				item: { type: "text", text: id },
			};
		}
	}
	stripItems.hidden = {
		id: "hidden",
		location: "statusbar.left",
		priority: 100,
		when: () => false,
		item: { type: "text", text: "hidden" },
	};
	const { host } = createAppHost();
	const view = render(
		<HostProvider value={host}>
			<PanelRenderersProvider value={{ editorPanelIds: [], stripItems }}>
				<StripHostView />
			</PanelRenderersProvider>
		</HostProvider>,
		{ reactStrictMode: true },
	);
	const ids = (slot: string) =>
		Array.from(
			view.container.querySelectorAll(`.sb-slot-${slot} [data-item-id]`),
		).map((element) => element.getAttribute("data-item-id"));
	return {
		intervals,
		view,
		ids,
		failCleanup: () => {
			failClear = true;
		},
	};
}

describe("status strip fixed interval with the real component", () => {
	it("keeps the initial tick, cadence, capacities, ordering and conditional visibility", () => {
		const { intervals, view, ids } = fixture();
		expect(intervals).toHaveLength(2);
		expect(intervals.map((interval) => interval.cleared)).toEqual([
			true,
			false,
		]);
		expect(ids("left")).toEqual(["l1", "l2", "l3", "l4"]);
		expect(ids("center")).toEqual(["c1", "c2"]);
		expect(ids("right")).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
		expect(
			view
				.getByRole("status", { name: "forgeax status bar" })
				.getAttribute("aria-live"),
		).toBe("polite");
		expect(view.container.querySelector('[data-item-id="hidden"]')).toBeNull();
		expect(view.getByLabelText("2 hidden status items, rotating")).toBeTruthy();
		act(() => intervals[1]!.callback());
		expect(ids("left")).toEqual(["l1", "l2", "l3", "l5"]);
		expect(ids("center")).toEqual(["c1", "c3"]);
		expect(ids("right")).toEqual(["r1", "r2", "r3", "r4", "r5", "r7"]);
		act(() => {
			intervals[1]!.callback();
			intervals[1]!.callback();
		});
		expect(ids("left")).toEqual(["l1", "l2", "l3", "l4"]);
		expect(intervals).toHaveLength(2);
	});

	it("fences the discarded StrictMode interval before it advances the current carousel", () => {
		const { intervals, ids } = fixture();
		act(() => intervals[0]!.callback());
		expect(ids("left")).toEqual(["l1", "l2", "l3", "l4"]);
		act(() => intervals[1]!.callback());
		expect(ids("left")).toEqual(["l1", "l2", "l3", "l5"]);
	});

	it("cleans both effect instances on unmount without rescheduling retained callbacks", () => {
		const { intervals, view } = fixture();
		view.unmount();
		expect(intervals.every((interval) => interval.cleared)).toBe(true);
		act(() => {
			for (const interval of intervals) interval.callback();
		});
		expect(intervals).toHaveLength(2);
		expect(view.container.childElementCount).toBe(0);
	});

	it("isolates native cleanup failure during unmount", () => {
		const { intervals, view, failCleanup } = fixture();
		failCleanup();
		expect(() => view.unmount()).not.toThrow();
		act(() => {
			for (const interval of intervals) interval.callback();
		});
		expect(view.container.childElementCount).toBe(0);
	});
});
