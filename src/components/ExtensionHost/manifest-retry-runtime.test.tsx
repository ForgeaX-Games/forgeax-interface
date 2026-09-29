import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import * as api from "../../lib/extension-api";
import { useExtensionManifest } from "../../lib/use-extension-manifest";

const restorers: (() => void)[] = [];
afterEach(() => {
	cleanup();
	for (const restore of restorers.splice(0).reverse()) restore();
});

const empty: api.ExtensionListResponse = { kind: null, count: 0, items: [] };
const ready: api.ExtensionInfo = {
	id: "ready",
	version: "1",
	kind: "tool",
	displayName: "Ready",
	frontendUrl: "/ready.js",
};

function fixture() {
	const timers: { callback: () => void; handle: number; cancelled: boolean }[] =
		[];
	const originalSet = globalThis.setTimeout;
	const originalClear = globalThis.clearTimeout;
	const set = spyOn(globalThis, "setTimeout").mockImplementation(((
		callback: () => void,
		delay?: number,
		...args: unknown[]
	) => {
		if (delay !== 1500) return originalSet(callback, delay, ...args);
		const handle = 930_000 + timers.length;
		timers.push({ callback, handle, cancelled: false });
		return handle;
	}) as typeof setTimeout);
	const clear = spyOn(globalThis, "clearTimeout").mockImplementation(
		(handle) => {
			const timer = timers.find(
				(candidate) => candidate.handle === Number(handle),
			);
			if (timer) timer.cancelled = true;
			else originalClear(handle);
		},
	);
	// Spy only at the existing request/cache boundary; use the real hook and released lifecycle.
	const lookup = spyOn(api, "listExtensionsShared").mockResolvedValue(empty);
	restorers.push(() => {
		lookup.mockRestore();
		set.mockRestore();
		clear.mockRestore();
	});
	const mount = async (id: string) => {
		let view!: ReturnType<
			typeof renderHook<ReturnType<typeof useExtensionManifest>, { id: string }>
		>;
		await act(async () => {
			view = renderHook(({ id }) => useExtensionManifest(id), {
				initialProps: { id },
				reactStrictMode: true,
			});
		});
		return view;
	};
	return { timers, lookup, mount };
}

describe("manifest retry with the real App Shell timeout lifecycle", () => {
	it("does not request an empty identity", async () => {
		const { timers, lookup, mount } = fixture();
		const view = await mount("");
		expect(view.result.current).toBeNull();
		expect(lookup).not.toHaveBeenCalled();
		expect(timers).toHaveLength(0);
	});

	it("uses the initial cache, forces later requests and stops on a usable manifest", async () => {
		const { timers, lookup, mount } = fixture();
		const view = await mount("ready");
		expect(lookup).toHaveBeenCalledTimes(2); // StrictMode replays the first effect.
		expect(lookup.mock.calls.map(([options]) => options?.force)).toEqual([
			false,
			false,
		]);
		expect(timers).toHaveLength(1); // Cancelled first request cannot schedule after await.
		lookup.mockResolvedValue({ kind: null, count: 1, items: [ready] });
		await act(async () => timers[0]!.callback());
		expect(lookup.mock.calls[2]![0]).toEqual({ force: true });
		expect(view.result.current).toEqual(ready);
		expect(timers).toHaveLength(1);
	});

	it("bounds failed async requests at fifteen attempts and stops with null", async () => {
		const { timers, lookup, mount } = fixture();
		lookup.mockRejectedValue(new Error("temporary lookup failure"));
		const view = await mount("missing");
		for (let i = 0; i < 14; i++) await act(async () => timers[i]!.callback());
		expect(lookup).toHaveBeenCalledTimes(16); // One discarded setup plus fifteen live attempts.
		expect(timers).toHaveLength(14);
		expect(view.result.current).toBeNull();
	});

	it("fences a previous identity timeout before it starts another request", async () => {
		const { timers, lookup, mount } = fixture();
		const view = await mount("old");
		const retained = timers[0]!;
		lookup.mockResolvedValue({ kind: null, count: 1, items: [ready] });
		await act(async () => view.rerender({ id: "ready" }));
		expect(retained.cancelled).toBe(true);
		expect(view.result.current).toEqual(ready);
		const calls = lookup.mock.calls.length;
		await act(async () => retained.callback());
		expect(lookup).toHaveBeenCalledTimes(calls);
		expect(view.result.current).toEqual(ready);
		expect(timers).toHaveLength(1);
	});

	it("fences an unmounted timeout before it starts another request", async () => {
		const { timers, lookup, mount } = fixture();
		const view = await mount("unmount");
		view.unmount();
		expect(timers[0]!.cancelled).toBe(true);
		const calls = lookup.mock.calls.length;
		await act(async () => timers[0]!.callback());
		expect(lookup).toHaveBeenCalledTimes(calls);
		expect(timers).toHaveLength(1);
	});

	it("keeps loading and does not schedule after an in-flight request settles following disposal", async () => {
		const { timers, lookup, mount } = fixture();
		let resolve!: (value: api.ExtensionListResponse) => void;
		lookup.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		const view = await mount("pending");
		expect(view.result.current).toBe("loading");
		expect(timers).toHaveLength(0);
		view.unmount();
		await act(async () => resolve(empty));
		expect(timers).toHaveLength(0);
	});
});
