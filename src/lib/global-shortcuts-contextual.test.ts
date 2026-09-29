import "./telemetry-test-prelude";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, renderHook } from "@testing-library/react";
import { createAppHost } from "../core/app-shell";
import { APPLICATION_KEYBINDING_SCOPE } from "../core/contextual-keybindings";
import { useShellStore } from "../store";
import { buildShortcuts, useGlobalShortcuts } from "./global-shortcuts";

try {
	GlobalRegistrator.register();
} catch {
	/* shared DOM test environment */
}

const disposals: Array<() => void | Promise<void>> = [];
let previousShell: ReturnType<typeof useShellStore.getState>;

beforeEach(() => {
	previousShell = useShellStore.getState();
	useShellStore.setState({ activeOverlay: null });
});

afterEach(async () => {
	cleanup();
	for (const dispose of disposals.splice(0).reverse()) await dispose();
	document.body.replaceChildren();
	useShellStore.setState(previousShell, true);
});

function retain<T extends () => void | Promise<void>>(dispose: T): T {
	disposals.push(dispose);
	return dispose;
}

function createTestHost() {
	const result = createAppHost();
	retain(() => result.control.dispose());
	return result.host;
}

function shortcutOwner() {
	return { run: mock<(event: KeyboardEvent) => void>(() => {}) };
}

function contribute(
	host: ReturnType<typeof createTestHost>,
	owner: ReturnType<typeof shortcutOwner>,
) {
	return retain(
		host.shortcuts.register({
			combo: "V",
			label: "Contributed action",
			group: "edit",
			match: (event) => event.key === "v",
			run: owner.run,
		}),
	);
}

function visibleEditor() {
	const anchor = document.createElement("div");
	anchor.dataset.surfaceAnchor = "edit";
	const rect = new DOMRect(0, 0, 640, 480);
	Object.defineProperty(anchor, "getClientRects", {
		value: () =>
			Object.assign([rect], {
				item: (index: number) => (index === 0 ? rect : null),
			}),
	});
	document.body.append(anchor);
	return anchor;
}

function pressV(target: HTMLElement) {
	const event = new KeyboardEvent("keydown", {
		key: "v",
		code: "KeyV",
		bubbles: true,
		cancelable: true,
	});
	target.dispatchEvent(event);
	return event;
}

describe("global shortcut capture integration", () => {
	it("routes injected product definitions instead of compatibility defaults", () => {
		const host = createTestHost();
		const run = mock(() => true);
		const shortcuts = [
			{
				combo: "Ctrl+,",
				label: "Product settings",
				group: "overlay",
				priority: 10,
				match: (event: KeyboardEvent) => event.ctrlKey && event.key === ",",
				run,
			},
		];
		const hook = renderHook(() =>
			useGlobalShortcuts(host.keybindings, host.shortcuts, shortcuts),
		);
		const press = () =>
			window.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: ",",
					ctrlKey: true,
					cancelable: true,
				}),
			);
		press();
		expect(run).toHaveBeenCalledTimes(1);
		expect(useShellStore.getState().activeOverlay).toBeNull();
		hook.unmount();
		press();
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("honors an empty product catalog without reactivating standalone defaults", () => {
		const host = createTestHost();
		renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts, []));
		const event = new KeyboardEvent("keydown", {
			key: ",",
			ctrlKey: true,
			cancelable: true,
		});
		window.dispatchEvent(event);
		expect(useShellStore.getState().activeOverlay).toBeNull();
		expect(event.defaultPrevented).toBe(false);
	});

	it("runs contextual resolution before host shortcuts in the single listener", async () => {
		const host = createTestHost();
		const widget = document.createElement("button");
		document.body.append(widget);
		let calls = 0;
		retain(
			host.commands.register({
				id: "widget.rename",
				execute: () => {
					calls += 1;
				},
			}),
		);
		retain(host.keybindings.registerScope(widget, "test.widget"));
		retain(
			host.keybindings.register({
				keys: "F2",
				commandId: "widget.rename",
				scope: "test.widget",
			}),
		);

		renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts));
		const event = new KeyboardEvent("keydown", {
			key: "F2",
			bubbles: true,
			cancelable: true,
		});
		widget.dispatchEvent(event);
		await Promise.resolve();

		expect(calls).toBe(1);
		expect(event.defaultPrevented).toBe(true);
	});

	it("routes Mod+S through editor.save when the viewport anchor is absent", async () => {
		const host = createTestHost();
		let saveCalls = 0;
		retain(
			host.commands.register({
				id: "editor.save",
				execute: () => {
					saveCalls += 1;
					return { status: "completed" as const };
				},
			}),
		);
		retain(
			host.keybindings.register({
				commandId: "editor.save",
				keys: "Mod+S",
				scope: APPLICATION_KEYBINDING_SCOPE,
				allowInEditable: true,
				priority: 100,
			}),
		);

		renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts));
		const event = new KeyboardEvent("keydown", {
			key: "s",
			code: "KeyS",
			ctrlKey: true,
			bubbles: true,
			cancelable: true,
		});
		document.body.dispatchEvent(event);
		await Promise.resolve();

		expect(saveCalls).toBe(1);
		expect(event.defaultPrevented).toBe(true);
	});

	for (const enabled of [true, false]) {
		it(`lets a ${enabled ? "handled" : "disabled-but-claimed"} contextual V binding stop the overlapping viewport route`, async () => {
			const host = createTestHost();
			const anchor = visibleEditor();
			const widget = document.createElement("button");
			anchor.append(widget);
			const deps = shortcutOwner();
			const contextual = mock(() => {});
			contribute(host, deps);
			retain(
				host.commands.register({
					id: "widget.view",
					when: () => enabled,
					execute: contextual,
				}),
			);
			retain(host.keybindings.registerScope(widget, "test.widget"));
			const removeBinding = retain(
				host.keybindings.register({
					commandId: "widget.view",
					keys: "V",
					scope: "test.widget",
				}),
			);
			renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts));

			const claimed = pressV(widget);
			await Promise.resolve();
			expect(contextual).toHaveBeenCalledTimes(enabled ? 1 : 0);
			expect(claimed.defaultPrevented).toBe(true);
			expect(deps.run).not.toHaveBeenCalled();

			await removeBinding();
			const unclaimed = pressV(widget);
			expect(deps.run).toHaveBeenCalledTimes(1);
			expect(deps.run.mock.calls[0][0]).toBe(unclaimed);
			expect(unclaimed.defaultPrevented).toBe(true);
		});
	}

	it("routes to contributions registered after the hook has mounted", () => {
		const host = createTestHost();
		const anchor = visibleEditor();
		renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts));
		expect(pressV(anchor).defaultPrevented).toBe(false);

		const deps = shortcutOwner();
		contribute(host, deps);
		const event = pressV(anchor);
		expect(deps.run).toHaveBeenCalledTimes(1);
		expect(deps.run.mock.calls[0][0]).toBe(event);
		expect(event.defaultPrevented).toBe(true);
	});

	it("replaces A with B while the same hook remains mounted", () => {
		const host = createTestHost();
		const anchor = visibleEditor();
		const a = shortcutOwner();
		const b = shortcutOwner();
		const removeA = contribute(host, a);
		renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts));
		const first = pressV(anchor);
		expect(a.run.mock.calls[0][0]).toBe(first);

		removeA();
		contribute(host, b);
		const replacement = pressV(anchor);
		expect(a.run).toHaveBeenCalledTimes(1);
		expect(b.run).toHaveBeenCalledTimes(1);
		expect(b.run.mock.calls[0][0]).toBe(replacement);
		expect(replacement.defaultPrevented).toBe(true);
	});

	it("unregisters contributed routing without unmounting the hook or consuming stale keys", () => {
		const host = createTestHost();
		const anchor = visibleEditor();
		const deps = shortcutOwner();
		const remove = contribute(host, deps);
		renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts));
		pressV(anchor);
		expect(deps.run).toHaveBeenCalledTimes(1);

		remove();
		const event = pressV(anchor);
		expect(deps.run).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(false);
	});

	it("keeps one capture listener through mount, cleanup and remount and preserves the raw event", () => {
		const host = createTestHost();
		const anchor = visibleEditor();
		const deps = shortcutOwner();
		contribute(host, deps);
		const add = spyOn(window, "addEventListener");
		const remove = spyOn(window, "removeEventListener");
		retain(() => {
			add.mockRestore();
			remove.mockRestore();
		});
		const keydownAdds = () =>
			add.mock.calls.filter(([type]) => type === "keydown");
		const keydownRemoves = () =>
			remove.mock.calls.filter(([type]) => type === "keydown");
		const activeListeners = () =>
			keydownAdds().length - keydownRemoves().length;

		const mounted = renderHook(() =>
			useGlobalShortcuts(host.keybindings, host.shortcuts),
		);
		expect(activeListeners()).toBe(1);
		expect(keydownAdds()[0][2]).toBe(true);
		const first = pressV(anchor);
		expect(deps.run).toHaveBeenCalledTimes(1);
		expect(deps.run.mock.calls[0][0]).toBe(first);

		mounted.unmount();
		expect(activeListeners()).toBe(0);
		expect(keydownRemoves()[0]).toEqual(keydownAdds()[0]);
		expect(pressV(anchor).defaultPrevented).toBe(false);
		expect(deps.run).toHaveBeenCalledTimes(1);

		const remounted = renderHook(() =>
			useGlobalShortcuts(host.keybindings, host.shortcuts),
		);
		expect(activeListeners()).toBe(1);
		expect(keydownAdds()).toHaveLength(2);
		expect(keydownAdds()[1][2]).toBe(true);
		const second = pressV(anchor);
		expect(deps.run).toHaveBeenCalledTimes(2);
		expect(deps.run.mock.calls[1][0]).toBe(second);
		remounted.unmount();
		expect(activeListeners()).toBe(0);
		expect(keydownRemoves()[1]).toEqual(keydownAdds()[1]);
	});

	it("keeps shell Escape ahead of a viewport contribution outside Play even when yielding browser default", () => {
		const host = createTestHost();
		const anchor = visibleEditor();
		useShellStore.setState({ fullscreen: false, activeOverlay: null });
		const viewport = mock(() => true);
		retain(
			host.shortcuts.register({
				combo: "Viewport Escape",
				label: "Viewport Escape",
				group: "edit",
				match: (event) => event.key === "Escape",
				run: viewport,
			}),
		);
		renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts));
		const event = new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true,
			cancelable: true,
		});
		anchor.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(viewport).not.toHaveBeenCalled();
	});

	it("lets a higher-priority owner claim Escape before shell dismissal", () => {
		const host = createTestHost();
		useShellStore.setState({ activeOverlay: "settings" });
		const owner = mock(() => true);
		const shellEscape = buildShortcuts().find(
			(shortcut) => shortcut.combo === "Esc",
		);
		if (!shellEscape) throw new Error("Expected the shell Escape shortcut");
		retain(
			host.shortcuts.register({
				combo: shellEscape.combo,
				label: shellEscape.label,
				group: shellEscape.group,
				priority: 20,
				allowInInput: true,
				match: (event) => event.key === "Escape",
				run: owner,
			}),
		);
		renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts));
		const input = document.createElement("input");
		document.body.append(input);
		const event = new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true,
			cancelable: true,
		});
		input.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(owner).toHaveBeenCalledTimes(1);
		expect(useShellStore.getState().activeOverlay).toBe("settings");
	});

	it("terminates the first matched contribution when it returns false", () => {
		const host = createTestHost();
		const first = mock(() => false);
		const second = mock(() => true);
		for (const run of [first, second])
			retain(
				host.shortcuts.register({
					combo: "V",
					label: "V",
					group: "general",
					match: (event) => event.key === "v",
					run,
				}),
			);
		renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts));
		expect(pressV(document.body).defaultPrevented).toBe(false);
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
	});

	it("uses the same live contribution snapshot for shortcut listing and routing", () => {
		const host = createTestHost();
		expect(
			buildShortcuts(host.shortcuts).some(
				(shortcut) => shortcut.label === "Contributed action",
			),
		).toBe(false);
		const remove = contribute(host, shortcutOwner());
		expect(
			buildShortcuts(host.shortcuts).some(
				(shortcut) => shortcut.label === "Contributed action",
			),
		).toBe(true);
		remove();
		expect(
			buildShortcuts(host.shortcuts).some(
				(shortcut) => shortcut.label === "Contributed action",
			),
		).toBe(false);
	});

	it("keeps one unchanged shell Escape row at its original position despite a higher-priority duplicate", () => {
		const host = createTestHost();
		const shell = buildShortcuts();
		const escapeIndex = shell.findIndex((shortcut) => shortcut.combo === "Esc");
		const escapeShortcut = shell[escapeIndex];
		retain(
			host.shortcuts.register({
				...escapeShortcut,
				priority: 20,
				run: () => true,
			}),
		);

		const listed = buildShortcuts(host.shortcuts);
		expect(listed.filter((shortcut) => shortcut.combo === "Esc")).toHaveLength(
			1,
		);
		expect(listed.findIndex((shortcut) => shortcut.combo === "Esc")).toBe(
			escapeIndex,
		);
		expect(listed[escapeIndex].priority).toBe(10);
		expect(
			listed.map(({ combo, group, label }) => ({ combo, group, label })),
		).toEqual(
			shell.map(({ combo, group, label }) => ({ combo, group, label })),
		);
		expect(host.shortcuts.snapshot()).toHaveLength(1);
	});

	it("lists contributions after every non-palette shell row and before the palette irrespective of routing priority", () => {
		const host = createTestHost();
		const shell = buildShortcuts();
		retain(
			host.shortcuts.register({
				combo: "Product action",
				label: "Product action",
				group: "edit",
				priority: 100,
				match: () => false,
				run: () => true,
			}),
		);

		const listed = buildShortcuts(host.shortcuts);
		expect(
			listed
				.slice(0, -2)
				.map(({ combo, group, label }) => ({ combo, group, label })),
		).toEqual(
			shell
				.slice(0, -1)
				.map(({ combo, group, label }) => ({ combo, group, label })),
		);
		expect(listed.at(-2)?.combo).toBe("Product action");
		expect(listed.at(-1)?.combo).toBe("Ctrl+K");
	});

	it("retains the same combo with a distinct label or group and hides only exact duplicate contribution rows", () => {
		const host = createTestHost();
		const escapeShortcut = buildShortcuts().find(
			(shortcut) => shortcut.combo === "Esc",
		);
		if (!escapeShortcut) throw new Error("Expected the shell Escape shortcut");
		retain(host.shortcuts.register({ ...escapeShortcut, group: "edit" }));
		retain(
			host.shortcuts.register({
				...escapeShortcut,
				label: "Different Escape action",
			}),
		);
		retain(
			host.shortcuts.register({
				...escapeShortcut,
				label: "Different Escape action",
			}),
		);

		const escapes = buildShortcuts(host.shortcuts).filter(
			(shortcut) => shortcut.combo === "Esc",
		);
		expect(escapes).toHaveLength(3);
		expect(escapes.map(({ group, label }) => ({ group, label }))).toEqual([
			{ group: escapeShortcut.group, label: escapeShortcut.label },
			{ group: "edit", label: escapeShortcut.label },
			{ group: escapeShortcut.group, label: "Different Escape action" },
		]);
		expect(host.shortcuts.snapshot()).toHaveLength(3);
	});

	it("keeps typing, IME, preview and live shell visibility guards before contributed match", () => {
		const host = createTestHost();
		const anchor = visibleEditor();
		const match = mock(() => true);
		const run = mock(() => true);
		retain(
			host.shortcuts.register({
				combo: "V",
				label: "V",
				group: "edit",
				match,
				run,
			}),
		);
		renderHook(() => useGlobalShortcuts(host.keybindings, host.shortcuts));
		const input = document.createElement("input");
		anchor.append(input);
		expect(pressV(input).defaultPrevented).toBe(false);
		const composing = new KeyboardEvent("keydown", {
			key: "v",
			isComposing: true,
			bubbles: true,
			cancelable: true,
		});
		anchor.dispatchEvent(composing);
		expect(composing.defaultPrevented).toBe(false);
		const preview = document.createElement("canvas");
		preview.dataset.fxKeyboardSurface = "preview";
		anchor.append(preview);
		expect(pressV(preview).defaultPrevented).toBe(false);
		useShellStore.setState({ activeOverlay: "settings" });
		expect(pressV(anchor).defaultPrevented).toBe(false);
		useShellStore.setState({ activeOverlay: null });
		anchor.remove();
		expect(pressV(document.body).defaultPrevented).toBe(false);
		expect(match).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
		document.body.append(anchor);
		expect(pressV(anchor).defaultPrevented).toBe(true);
		expect(match).toHaveBeenCalledTimes(1);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("isolates host registries and fences retained contributions after host disposal", async () => {
		const { host, control } = createAppHost();
		const second = createTestHost();
		const owner = shortcutOwner();
		contribute(host, owner);
		expect(host.capabilities.has("shortcuts")).toBe(true);
		expect(second.shortcuts.snapshot()).toHaveLength(0);
		const retained = host.shortcuts.snapshot()[0];
		await control.dispose();
		await control.dispose();
		const event = new KeyboardEvent("keydown", { key: "v" });
		expect(retained.match(event)).toBe(false);
		expect(retained.run(event)).toBe(false);
		expect(owner.run).not.toHaveBeenCalled();
		expect(host.shortcuts.snapshot()).toHaveLength(0);
	});
});
