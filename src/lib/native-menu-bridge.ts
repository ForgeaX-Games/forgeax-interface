/** Compatibility transport for standalone shells; synchronization is shared. */
import {
	type ApplicationMenuRegistry,
	installApplicationNativeMenuBridge,
} from "@forgeax/app-shell/application";
import { subscribeLocale } from "../i18n";
import { MENU_IDS } from "./application-menu-projection";
import { isTauri } from "./platform/runtime";
import { warmRecentGames } from "./recent-games";

// ─── Types ────────────────────────────────────────────────────────────────

/** 派发接口:与 host.commands.execute 兼容,fire-and-forget。 */
export type MenuExecute = (
	id: string,
	args?: unknown,
) => void | Promise<unknown>;

export interface InitNativeMenuBridgeOptions {
	menus: ApplicationMenuRegistry;
	/** 命令派发器 —— 通常是 (id, args) => host.commands.execute(id, args)。 */
	execute: MenuExecute;
	/** i18n 翻译器 —— 通常是 useTranslation().t。 */
	translate: (key: string) => string;
}

/** The existing Tauri menu endpoint, injectable for lifecycle contract tests. */
export interface NativeMenuTransport {
	invoke(command: string, args: Record<string, unknown>): Promise<unknown>;
	listen(listener: (id: string) => void): Promise<() => void>;
}

export interface NativeMenuBridgeDependencies {
	loadTransport(): Promise<NativeMenuTransport>;
	warmRecentGames(): Promise<void>;
	subscribeLocale(listener: () => void): () => void;
	reportError(error: unknown): void;
}

/** One mounted shell owns all native subscriptions, including asynchronous setup. */
export function installNativeMenuBridge(
	opts: InitNativeMenuBridgeOptions,
	deps: NativeMenuBridgeDependencies,
): () => void {
	return installApplicationNativeMenuBridge({
		menus: opts.menus,
		menuIds: MENU_IDS,
		title: (menu) => opts.translate(`menubar.${menu}`),
		execute: opts.execute,
		prepare: deps.warmRecentGames,
		subscribeLabels: deps.subscribeLocale,
		reportError: deps.reportError,
		async loadTransport() {
			const transport = await deps.loadTransport();
			return {
				publish: (payload) => transport.invoke("set_app_menu", { payload }),
				listen: (listener) => transport.listen(listener),
			};
		},
	});
}

/** Browser shells install nothing. React effect cleanup also fences late imports. */
export function initNativeMenuBridge(
	opts: InitNativeMenuBridgeOptions,
): () => void {
	if (!isTauri()) return () => {};
	return installNativeMenuBridge(opts, {
		async loadTransport() {
			const [core, events] = await Promise.all([
				import("@tauri-apps/api/core"),
				import("@tauri-apps/api/event"),
			]);
			return {
				invoke: (command, args) => core.invoke(command, args),
				listen: (listener) =>
					events.listen<{ id: string }>("menu:invoke", (event) =>
						listener(event.payload?.id),
					),
			};
		},
		warmRecentGames,
		subscribeLocale: (listener) => subscribeLocale(listener),
		reportError: (error) => console.warn("[native-menu-bridge]", error),
	});
}
