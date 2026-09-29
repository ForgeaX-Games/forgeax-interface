import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { registerAction } from "@forgeax/app-shell/application";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { createAppHost, HostProvider } from "../../core/app-shell";
import {
	getCommandPaletteOpen,
	setCommandPaletteOpen,
} from "../../lib/command-palette-store";
import { CommandPalette } from "../CommandPalette/CommandPalette";
import { PanelShell } from "./PanelShell";

const restorers: (() => void)[] = [];
afterEach(() => {
	cleanup();
	setCommandPaletteOpen(false);
	for (const restore of restorers.splice(0).reverse()) restore();
});

function trapTimeouts(delayMs: number) {
	const entries: {
		callback: () => void;
		handle: number;
		cancelled: boolean;
	}[] = [];
	const originalSet = globalThis.setTimeout;
	const originalClear = globalThis.clearTimeout;
	const set = spyOn(globalThis, "setTimeout").mockImplementation(((
		callback: () => void,
		delay?: number,
		...args: unknown[]
	) => {
		if (delay !== delayMs) return originalSet(callback, delay, ...args);
		const handle = 900_000 + entries.length;
		entries.push({ callback, handle, cancelled: false });
		return handle;
	}) as typeof setTimeout);
	const clear = spyOn(globalThis, "clearTimeout").mockImplementation(
		(handle) => {
			const entry = entries.find(
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
	return entries;
}

describe("delayed-close consumers with the real App Shell release", () => {
	it("keeps palette feedback until the newest timeout and fences a cancelled close in StrictMode", async () => {
		const timers = trapTimeouts(1100);
		restorers.push(
			registerAction({
				id: "m82.test",
				title: "M82 test action",
				capability: "read",
				run: () => ({ status: "completed", stateDigest: { ok: true } }),
			}),
		);
		act(() => setCommandPaletteOpen(true));
		const view = render(
			<StrictMode>
				<CommandPalette />
			</StrictMode>,
		);
		const choose = async () => {
			const item = Array.from(
				view.container.querySelectorAll("[cmdk-item]"),
			).find((element) => element.textContent?.includes("M82 test action"));
			expect(item).toBeTruthy();
			await act(async () => {
				fireEvent.click(item!);
			});
		};
		await choose();
		expect(timers).toHaveLength(1);
		expect(
			view.container.querySelector(".fx-cmdk-feedback--ok")?.textContent,
		).toContain('"ok":true');
		await choose();
		expect(timers[0]!.cancelled).toBe(true);
		act(() => timers[0]!.callback());
		expect(getCommandPaletteOpen()).toBe(true);
		act(() => timers[1]!.callback());
		expect(getCommandPaletteOpen()).toBe(false);

		act(() => setCommandPaletteOpen(true));
		await choose();
		act(() =>
			fireEvent.click(view.container.querySelector(".fx-cmdk-overlay")!),
		);
		expect(timers[2]!.cancelled).toBe(true);
		act(() => setCommandPaletteOpen(true));
		act(() => timers[2]!.callback());
		expect(getCommandPaletteOpen()).toBe(true);
		await choose();
		view.unmount();
		expect(timers[3]!.cancelled).toBe(true);
		act(() => timers[3]!.callback());
		expect(getCommandPaletteOpen()).toBe(true);
	});

	it("preserves overflow hover cancellation, click lock and delayed close after StrictMode replay", () => {
		const timers = trapTimeouts(180);
		const style = document.createElement("style");
		style.textContent =
			".fx-panel-header { padding-left: 0px; padding-right: 0px; }";
		document.head.append(style);
		restorers.push(() => style.remove());
		const { host } = createAppHost();
		const view = render(
			<StrictMode>
				<HostProvider value={host}>
					<PanelShell
						id="m82.panel"
						panel={{
							title: "Timer test",
							header: { visible: true },
							render: () => <div>Body</div>,
							actions: [
								{
									id: "m82.action",
									panelId: "m82.panel",
									command: "m82.command",
									title: "Test action",
								},
							],
						}}
					/>
				</HostProvider>
			</StrictMode>,
		);
		const trigger = view.container.querySelector<HTMLButtonElement>(
			".fx-panel-overflow-trigger",
		);
		expect(trigger).toBeTruthy();
		act(() => fireEvent.pointerEnter(trigger!));
		expect(trigger!.getAttribute("aria-expanded")).toBe("true");
		act(() => fireEvent.pointerLeave(trigger!));
		expect(timers).toHaveLength(1);
		act(() => fireEvent.pointerEnter(trigger!));
		expect(timers[0]!.cancelled).toBe(true);
		act(() => timers[0]!.callback());
		expect(trigger!.getAttribute("aria-expanded")).toBe("true");
		act(() => fireEvent.click(trigger!));
		act(() => fireEvent.pointerLeave(trigger!));
		act(() => timers[1]!.callback());
		expect(trigger!.getAttribute("aria-expanded")).toBe("true");
		act(() => fireEvent.click(trigger!));
		act(() => fireEvent.pointerEnter(trigger!));
		act(() => fireEvent.pointerLeave(trigger!));
		act(() => timers[2]!.callback());
		expect(trigger!.getAttribute("aria-expanded")).toBe("false");
		act(() => fireEvent.pointerEnter(trigger!));
		act(() => fireEvent.pointerLeave(trigger!));
		view.unmount();
		expect(timers[3]!.cancelled).toBe(true);
		act(() => timers[3]!.callback());
	});
});
