import type {
	ApplicationShortcut,
	ApplicationShortcutRegistry,
} from "@forgeax/app-shell/application";
import { installApplicationKeyboardRouter } from "@forgeax/app-shell/application";
import { useEffect } from "react";
import { t } from "@/i18n";
import type { ContextualKeybindingsApi } from "../core/contextual-keybindings";
import { useShellStore } from "../store";
import { toggleCommandPalette } from "./command-palette-store";

/**
 * Global keyboard shortcuts · Blender-inspired, IME-safe.
 *
 *   Ctrl+Shift+F  toggle fullscreen (hide TopBar / Sidebar / ChatPanel / StatusBar)
 *   Ctrl+,        open / close Settings
 *   Ctrl+Shift+B  toggle Sidebar
 *   Ctrl+Shift+C  toggle ChatPanel
 *   Ctrl+Shift+D  toggle Dashboard overlay
 *   Ctrl+Shift+0  open Settings → Plugins
 *   Ctrl+/        focus chat composer
 *   Ctrl+Shift+H  open Settings → Changelog (was Ctrl+H before 2026-08-04 —
 *                 UE-parity editor hide claimed Ctrl+H for "show all hidden")
 *   Esc           close current overlay (higher-priority owners may claim it)
 *                 (Settings → Dashboard → Fullscreen)
 *
 * IME 安全:
 *   - 总是用 Ctrl+Shift 复合,避开浏览器原生 (Ctrl+1/2/3 切 tab · Ctrl+J 下载 · Ctrl+B 收藏栏 · Ctrl+W/T 关/开 tab)
 *   - keydown 时检查 `event.isComposing` / `event.keyCode === 229` (中文输入法组词中)
 *   - target 是 input/textarea/contenteditable 时跳过非 Esc / Ctrl+/ (允许"focus composer"在输入框里也能撤焦再聚)
 *   - macOS:Cmd 与 Ctrl 同义 (event.metaKey || event.ctrlKey)
 *
 * 注册:在 App 顶层调用 `useGlobalShortcuts()` 一次。
 */

export {
	type ApplicationKeydownHandler as GlobalKeydownHandler,
	dispatchApplicationKeydownHandlers as dispatchGlobalKeydownHandlers,
	isApplicationKeyComposing as isComposing,
	registerApplicationKeydownHandler as registerGlobalKeydownHandler,
} from "@forgeax/app-shell/application";

export type ShortcutDef = ApplicationShortcut;

// Helper: is the event happening inside a text-editing surface?
// Guards against non-Element targets (e.g. window / document from synthetic
// dispatch) where .tagName / .closest aren't defined.
// Exported for unit tests (T4-9 typing-target-guard coverage).
export function isTypingTarget(e: KeyboardEvent): boolean {
	const t = e.target;
	if (
		typeof document !== "undefined" &&
		document.querySelector('.im-editor[data-listening="1"]')
	)
		return true;
	if (!t || !(t instanceof Element)) return false;
	const tag = (t as HTMLElement).tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	if ((t as HTMLElement).isContentEditable) return true;
	// RichInput composer / Input Map panel
	if (
		t.closest(
			'.im-editor, .kc-composer-rich, [data-kc-composer], [contenteditable="true"]',
		)
	)
		return true;
	return false;
}

/** Preview canvases own their edit-domain keyboard input locally. */
export function isKeyboardOwnedSurface(e: KeyboardEvent): boolean {
	const t = e.target;
	return (
		t instanceof Element && t.closest("[data-fx-keyboard-surface]") !== null
	);
}

export function shouldSkipGlobalShortcut(
	e: KeyboardEvent,
	shortcut: Pick<ShortcutDef, "group">,
): boolean {
	return shortcut.group === "edit" && isKeyboardOwnedSurface(e);
}

/** IME / synthetic events may omit `key`; never call `.toLowerCase()` blindly. */
function safeKeyLower(e: KeyboardEvent): string {
	return typeof e.key === "string" ? e.key.toLowerCase() : "";
}

// Ctrl-or-Cmd helper.
function mod(e: KeyboardEvent): boolean {
	return e.ctrlKey || e.metaKey;
}

// Is the scene editor the surface the user is currently looking at?
//
// Contributions classified as edit use the product shell's existing surface
// identity and visibility policy. Read at event time so page/overlay changes
// take effect without rebuilding the host or listener.
export function isEditorSurfaceActive(): boolean {
	if (useShellStore.getState().activeOverlay) return false;
	const anchor =
		typeof document === "undefined"
			? null
			: document.querySelector<HTMLElement>('[data-surface-anchor="edit"]');
	return Boolean(anchor && anchor.getClientRects().length > 0);
}

// Build the Settings list in product order, not event-routing priority order.
// Exact duplicate descriptions share a row, but remain separate runtime owners.
export function buildShortcuts(
	contributions?: ApplicationShortcutRegistry,
): ShortcutDef[] {
	const store = useShellStore.getState;
	const shortcuts: ShortcutDef[] = [
		// ── Layout (collapse / fullscreen) ──
		{
			combo: "Ctrl+Shift+F",
			group: "layout",
			label: t("shortcuts.gameFullscreen"),
			match: (e) => mod(e) && e.shiftKey && e.code === "KeyF",
			run: () => {
				store().toggleFullscreen();
				return true;
			},
		},
		{
			combo: "Ctrl+Shift+Enter",
			group: "layout",
			label: t("shortcuts.browserFullscreen"),
			match: (e) =>
				mod(e) && e.shiftKey && (e.code === "Enter" || e.key === "Enter"),
			run: () => {
				// Browser-native fullscreen toggle. Independent of store.fullscreen
				// — user can have either, both, or neither. Esc exits the native FS
				// automatically; fullscreenchange listener below keeps state in sync
				// if needed (we don't currently mirror native FS into the store,
				// because the two modes are intentionally orthogonal).
				try {
					if (!document.fullscreenElement) {
						void document.documentElement.requestFullscreen?.().catch(() => {
							/* blocked */
						});
					} else {
						void document.exitFullscreen?.().catch(() => {
							/* */
						});
					}
				} catch {
					/* old browsers without FS API */
				}
				return true;
			},
		},
		{
			combo: "Ctrl+Shift+B",
			group: "layout",
			label: t("shortcuts.toggleSidebar"),
			match: (e) => mod(e) && e.shiftKey && e.code === "KeyB",
			run: () => {
				store().toggleSidebar();
				return true;
			},
		},
		{
			combo: "Ctrl+Shift+C",
			group: "layout",
			label: t("shortcuts.toggleChatPanel"),
			match: (e) => mod(e) && e.shiftKey && e.code === "KeyC",
			run: () => {
				store().toggleChatpanel();
				return true;
			},
		},
		{
			// 3-state chat toggle: closed → open at default (ChatDock); open but dragged
			// into the centre grid → move it home; open at default → close. ChatDock owns
			// the actual work (it holds chat's dockview api + panelLocations) — we just
			// fire the intent so a single handler converges every route. preventDefault
			// always so F1 never opens the browser help page.
			combo: "F1",
			group: "layout",
			label: t("shortcuts.revealChat"),
			match: (e) =>
				!mod(e) &&
				!e.shiftKey &&
				!e.altKey &&
				(e.key === "F1" || e.code === "F1"),
			run: () => {
				window.dispatchEvent(new CustomEvent("forgeax:chat-toggle"));
				return true;
			},
		},

		// ── Overlay (Dashboard / Settings) ──
		{
			combo: "Ctrl+Shift+D",
			group: "overlay",
			label: t("shortcuts.toggleDashboard"),
			match: (e) => mod(e) && e.shiftKey && e.code === "KeyD",
			run: () => {
				const s = store();
				s.activeOverlay === "dashboard"
					? s.closeOverlay()
					: s.openOverlay("dashboard");
				return true;
			},
		},
		{
			combo: "Ctrl+,",
			group: "overlay",
			label: t("shortcuts.toggleSettings"),
			match: (e) =>
				mod(e) && !e.shiftKey && (e.key === "," || e.code === "Comma"),
			run: () => {
				const s = store();
				s.activeOverlay === "settings"
					? s.closeOverlay()
					: s.openOverlay("settings");
				return true;
			},
		},
		{
			combo: "Ctrl+Shift+H",
			group: "overlay",
			label: t("shortcuts.openChangelog"),
			match: (e) => mod(e) && e.shiftKey && e.code === "KeyH",
			run: () => {
				store().openOverlay("settings", "changelog");
				return true;
			},
		},
		{
			combo: "Esc",
			group: "overlay",
			label: t("shortcuts.closeOverlay"),
			allowInInput: true,
			match: (e) => e.key === "Escape" && !mod(e) && !e.shiftKey && !e.altKey,
			run: () => {
				const s = store();
				// UI overlays own Escape first. Plain Escape is not a lifecycle
				// command: Play may use it for pause/menu. Stop remains on the toolbar.
				if (s.activeOverlay) {
					s.closeOverlay();
					return true;
				}
				// Browser fullscreen exits automatically on Esc — but be defensive
				// in case some browser swallows the event before reaching the native
				// handler; explicit exit is a no-op when no element is fullscreen.
				if (document.fullscreenElement) {
					void document.exitFullscreen?.().catch(() => {
						/* */
					});
					return true;
				}
				if (s.fullscreen) {
					s.setFullscreen(false);
					return true;
				}
				return false;
			},
		},

		{
			combo: "Ctrl+Shift+0",
			group: "overlay",
			label: t("shortcuts.openExtensions"),
			match: (e) =>
				mod(e) &&
				e.shiftKey &&
				(e.code === "Digit0" || e.key === "0" || e.key === ")"),
			run: () => {
				store().openOverlay("settings", "plugins");
				return true;
			},
		},

		// ── Focus ──
		{
			combo: "Ctrl+/",
			group: "focus",
			label: t("shortcuts.focusComposer"),
			allowInInput: true,
			match: (e) =>
				mod(e) && !e.shiftKey && (e.key === "/" || e.code === "Slash"),
			run: () => {
				// Auto-uncollapse first if hidden.
				const s = store();
				if (s.chatpanelCollapsed) s.toggleChatpanel();
				// Focus the composer's editable element. Selector covers RichInput
				// (preferred new path) and the legacy textarea fallback.
				const el =
					document.querySelector<HTMLElement>(
						'.kc-composer-rich [contenteditable="true"]',
					) ||
					document.querySelector<HTMLElement>(".kc-composer textarea") ||
					document.querySelector<HTMLElement>("[data-kc-composer]");
				if (el) {
					el.focus();
					// Move caret to end if it's a contenteditable
					if (el.isContentEditable) {
						const sel = window.getSelection();
						const range = document.createRange();
						range.selectNodeContents(el);
						range.collapse(false);
						sel?.removeAllRanges();
						sel?.addRange(range);
					}
				}
				return true;
			},
		},
	];
	shortcuts.push({
		priority: -20,
		combo: "Ctrl+K",
		group: "general",
		label: t("shortcuts.toggleCommandPalette"),
		match: (e) =>
			mod(e) &&
			!e.altKey &&
			!e.shiftKey &&
			(e.code === "KeyK" || safeKeyLower(e) === "k"),
		run: () => {
			toggleCommandPalette();
			return true;
		},
	});
	const shell = shortcuts.map((shortcut) => ({ priority: 10, ...shortcut }));
	const rowKey = ({ combo, group, label }: ShortcutDef): string =>
		JSON.stringify([combo, group, label]);
	const seen = new Set(shell.map(rowKey));
	const contributedRows: ShortcutDef[] = [];
	for (const shortcut of contributions?.snapshot() ?? []) {
		const key = rowKey(shortcut);
		if (seen.has(key)) continue;
		seen.add(key);
		contributedRows.push(shortcut);
	}
	return [...shell.slice(0, -1), ...contributedRows, ...shell.slice(-1)];
}

/** Compatibility callers retain their definitions and product policies. */
export function useGlobalShortcuts(
	keybindings: ContextualKeybindingsApi,
	contributions: ApplicationShortcutRegistry,
	productShortcuts?: readonly ShortcutDef[],
): void {
	useEffect(
		() =>
			installApplicationKeyboardRouter({
				keybindings,
				contributions,
				shortcuts: productShortcuts ?? buildShortcuts(),
				isTypingTarget,
				shouldSkipShortcut: (event, shortcut) =>
					shouldSkipGlobalShortcut(event, shortcut) ||
					(shortcut.group === "edit" && !isEditorSurfaceActive()),
			}),
		[keybindings, contributions, productShortcuts],
	);
}

// macOS pretty-printing for shortcut combos shown in Settings.
// Returns the canonical UI string. When platform is omitted, auto-detects macOS.
export function prettyCombo(
	combo: string,
	platform?: "mac" | "windows",
): string {
	const isMac =
		platform === "mac" ||
		(platform === undefined &&
			typeof navigator !== "undefined" &&
			/mac/i.test(navigator.platform));
	if (!isMac) return combo;
	return combo
		.replace(/Ctrl/g, "⌘")
		.replace(/Shift/g, "⇧")
		.replace(/Alt/g, "⌥")
		.replace(/\+/g, "");
}
