import { afterEach, expect, test } from "bun:test";
import {
	configureShellAdapter,
	getShellAdapter,
	UnsupportedShellCapabilityError,
} from "./shell-adapter";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
	configureShellAdapter(null);
	if (originalWindow)
		Object.defineProperty(globalThis, "window", originalWindow);
	else Reflect.deleteProperty(globalThis, "window");
});

test("injected shell capabilities execute real host calls and release on reset", async () => {
	const calls: string[] = [];
	const capabilities = {
		tag: "vscode",
		getPlatform: async () => "linux",
		async openExternal(url: string) {
			calls.push(`${this.tag}:open:${url}`);
		},
		async closeWindow() {
			calls.push(`${this.tag}:close`);
		},
	};
	configureShellAdapter(capabilities);
	const host = getShellAdapter();
	expect(host.runtime).toBe("host");
	expect(host.supports("openExternal")).toBe(true);
	expect(host.supports("minimizeWindow")).toBe(false);
	expect(await host.getPlatform()).toBe("linux");
	await host.openExternal("https://example.test/");
	await host.closeWindow();
	expect(calls).toEqual(["vscode:open:https://example.test/", "vscode:close"]);
	expect(host.minimizeWindow()).rejects.toBeInstanceOf(
		UnsupportedShellCapabilityError,
	);
	configureShellAdapter(null);
	expect(getShellAdapter()).not.toBe(host);
	expect(getShellAdapter().runtime).toBe("web");
	await getShellAdapter().closeWindow();
	expect(calls).toHaveLength(2);
});

test("legacy browser and Tauri selection remain available without a host override", () => {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: new URL("http://localhost/"), open: () => {} },
	});
	expect(getShellAdapter().runtime).toBe("web");
	configureShellAdapter(null);
	(window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ =
		{};
	expect(getShellAdapter().runtime).toBe("tauri");
	expect(getShellAdapter().isTauri()).toBe(true);
});
