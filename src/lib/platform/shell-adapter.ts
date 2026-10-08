/**
 * ShellAdapter — OS-window / shell capabilities, abstracted over the two
 * runtimes. Mirrors gameclaw_pet/src/shell/ShellAdapter.ts: the React app only
 * ever talks to this interface, so the SAME components run unchanged in the
 * browser (web-server form, every method a no-op) and inside Tauri (real
 * native calls).
 *
 * Keep this surface small and capability-oriented — add a method only when a
 * component actually needs it, and always provide a sane browser fallback.
 */
import {
	isTauri,
	loadWebviewWindowApi,
	loadWindowApi,
	type PlatformRuntime,
	platformRuntime,
} from "./runtime";

export interface ShellAdapter {
	readonly runtime: PlatformRuntime;
	isTauri(): boolean;
	supports(capability: ShellCapability): boolean;
	/** 'macos' | 'windows' | 'linux' | 'browser'. */
	getPlatform(): Promise<string>;
	/** Begin an OS window drag (for custom/decoration-less title bars). */
	startDragging(): Promise<void>;
	minimizeWindow(): Promise<void>;
	toggleMaximizeWindow(): Promise<void>;
	closeWindow(): Promise<void>;
	setAlwaysOnTop(onTop: boolean): Promise<void>;
	openExternal(url: string): Promise<void>;
}

export type ShellCapability =
	| "startDragging"
	| "minimizeWindow"
	| "toggleMaximizeWindow"
	| "closeWindow"
	| "setAlwaysOnTop"
	| "openExternal";

export class UnsupportedShellCapabilityError extends Error {
	constructor(readonly capability: ShellCapability) {
		super(`Host does not provide shell capability: ${capability}`);
		this.name = "UnsupportedShellCapabilityError";
	}
}

/** The host supplies only capabilities it actually owns. */
export type HostShellCapabilities = Partial<
	Pick<
		ShellAdapter,
		| "getPlatform"
		| "startDragging"
		| "minimizeWindow"
		| "toggleMaximizeWindow"
		| "closeWindow"
		| "setAlwaysOnTop"
		| "openExternal"
	>
>;

let _adapter: ShellAdapter | null = null;
let hostCapabilities: HostShellCapabilities | null = null;

export function configureShellAdapter(
	capabilities: HostShellCapabilities | null,
): void {
	hostCapabilities = capabilities;
	_adapter = null;
}

export function getShellAdapter(): ShellAdapter {
	if (!_adapter)
		_adapter = hostCapabilities
			? createHostAdapter(hostCapabilities)
			: isTauri()
				? createTauriAdapter()
				: createBrowserAdapter();
	return _adapter;
}

function createHostAdapter(capabilities: HostShellCapabilities): ShellAdapter {
	const invoke = async (name: ShellCapability, ...args: unknown[]) => {
		const implementation = capabilities[name];
		if (!implementation) throw new UnsupportedShellCapabilityError(name);
		await Reflect.apply(implementation, capabilities, args);
	};
	return {
		runtime: "host",
		isTauri: () => false,
		supports: (capability) => typeof capabilities[capability] === "function",
		getPlatform: () =>
			capabilities.getPlatform?.() ?? Promise.resolve("unknown"),
		startDragging: () => invoke("startDragging"),
		minimizeWindow: () => invoke("minimizeWindow"),
		toggleMaximizeWindow: () => invoke("toggleMaximizeWindow"),
		closeWindow: () => invoke("closeWindow"),
		setAlwaysOnTop: (onTop) => invoke("setAlwaysOnTop", onTop),
		openExternal: (url) => invoke("openExternal", url),
	};
}

function createTauriAdapter(): ShellAdapter {
	return {
		runtime: "tauri",
		isTauri: () => true,
		supports: () => true,
		async getPlatform() {
			try {
				const os = await import("@tauri-apps/plugin-os");
				return os.platform();
			} catch {
				return "unknown";
			}
		},
		async startDragging() {
			const mod = await loadWebviewWindowApi();
			await mod?.getCurrentWebviewWindow().startDragging();
		},
		async minimizeWindow() {
			const mod = await loadWebviewWindowApi();
			await mod?.getCurrentWebviewWindow().minimize();
		},
		async toggleMaximizeWindow() {
			const mod = await loadWebviewWindowApi();
			await mod?.getCurrentWebviewWindow().toggleMaximize();
		},
		async closeWindow() {
			const mod = await loadWebviewWindowApi();
			await mod?.getCurrentWebviewWindow().close();
		},
		async setAlwaysOnTop(onTop: boolean) {
			const mod = await loadWindowApi();
			const wvMod = await loadWebviewWindowApi();
			// setAlwaysOnTop lives on the Window handle in tauri 2.
			if (wvMod) await wvMod.getCurrentWebviewWindow().setAlwaysOnTop(onTop);
			else void mod;
		},
		async openExternal(url: string) {
			const shell = await import("@tauri-apps/plugin-shell");
			await shell.open(url);
		},
	};
}

function createBrowserAdapter(): ShellAdapter {
	// Every native op is a no-op in the browser; the web app behaves exactly as
	// it does today (the user manages the browser window themselves).
	const noop = async () => {};
	return {
		runtime: platformRuntime(),
		isTauri: () => false,
		supports: (capability) => capability === "openExternal",
		async getPlatform() {
			return "browser";
		},
		startDragging: noop,
		minimizeWindow: noop,
		toggleMaximizeWindow: noop,
		closeWindow: noop,
		setAlwaysOnTop: noop,
		async openExternal(url: string) {
			window.open(url, "_blank", "noopener");
		},
	};
}
