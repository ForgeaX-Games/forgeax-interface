import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { useShellStore } from "../../store";
import { FilesPanel } from "./FilesPanel";

const restorers: (() => void)[] = [];
afterEach(() => {
	cleanup();
	for (const restore of restorers.splice(0).reverse()) restore();
});

const root = ".forgeax/games/m83-fixture";
const codePath = `${root}/src/nested/main.ts`;
const imagePath = `${root}/assets/hero.png`;
const tree = {
	type: "dir",
	name: "m83-fixture",
	path: root,
	children: [
		{
			type: "dir",
			name: "src",
			path: `${root}/src`,
			children: [
				{
					type: "dir",
					name: "nested",
					path: `${root}/src/nested`,
					children: [{ type: "file", name: "main.ts", path: codePath }],
				},
			],
		},
		{
			type: "dir",
			name: "assets",
			path: `${root}/assets`,
			children: [{ type: "file", name: "hero.png", path: imagePath }],
		},
	],
};

async function fixture() {
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
		const handle = 910_000 + timers.length;
		timers.push({ callback, handle, cancelled: false });
		return handle;
	}) as typeof setTimeout);
	const clear = spyOn(globalThis, "clearTimeout").mockImplementation(
		(handle) => {
			const entry = timers.find(
				(candidate) => candidate.handle === Number(handle),
			);
			if (entry) entry.cancelled = true;
			else originalClear(handle);
		},
	);
	restorers.push(() => {
		set.mockRestore();
		clear.mockRestore();
	});
	const fetch = spyOn(globalThis, "fetch").mockImplementation(async () =>
		Response.json({ tree }),
	);
	const scroll = spyOn(
		HTMLElement.prototype,
		"scrollIntoView",
	).mockImplementation(() => {});
	const previousSlug = useShellStore.getState().activeGameSlug;
	restorers.push(() => {
		fetch.mockRestore();
		scroll.mockRestore();
		useShellStore.setState({ activeGameSlug: previousSlug });
	});
	useShellStore.setState({ activeGameSlug: "m83-fixture" });
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<StrictMode>
				<FilesPanel />
			</StrictMode>,
		);
	});
	const row = (path: string) =>
		view.container.querySelector<HTMLButtonElement>(
			`[data-fp-path="${CSS.escape(path)}"]`,
		);
	const choose = (family: string) =>
		act(() =>
			fireEvent.click(
				view.container.querySelector(`.fp-type-chip.fam-${family}`)!,
			),
		);
	return { view, timers, scroll, row, choose };
}

describe("FilesPanel with the real App Shell timeout lifecycle", () => {
	it("expands, scrolls and focuses after commit, preserving a repeated same-path flash against stale callbacks", async () => {
		const { view, timers, scroll, row, choose } = await fixture();
		expect(row(codePath)).toBeNull();
		choose("code");
		expect(row(codePath)?.classList.contains("is-flash")).toBe(true);
		expect(document.activeElement).toBe(row(codePath));
		expect(scroll).toHaveBeenCalledWith({
			block: "center",
			behavior: "smooth",
		});
		expect(timers).toHaveLength(1);
		choose("code");
		expect(timers).toHaveLength(2);
		expect(timers[0]!.cancelled).toBe(true);
		act(() => timers[0]!.callback());
		expect(row(codePath)?.classList.contains("is-flash")).toBe(true);
		act(() => timers[1]!.callback());
		expect(row(codePath)?.classList.contains("is-flash")).toBe(false);
		choose("code");
		view.unmount();
		expect(timers[2]!.cancelled).toBe(true);
		act(() => timers[2]!.callback());
	});

	it("retains different-path identity without losing the newest cleanup handle after a cancelled callback", async () => {
		const { view, timers, row, choose } = await fixture();
		choose("code");
		choose("image");
		expect(timers).toHaveLength(2);
		expect(timers[0]!.cancelled).toBe(true);
		expect(row(codePath)?.classList.contains("is-flash")).toBe(false);
		expect(row(imagePath)?.classList.contains("is-flash")).toBe(true);
		expect(document.activeElement).toBe(row(imagePath));
		act(() => timers[0]!.callback());
		expect(row(imagePath)?.classList.contains("is-flash")).toBe(true);
		view.unmount();
		expect(timers[1]!.cancelled).toBe(true);
		act(() => timers[1]!.callback());
	});
});
