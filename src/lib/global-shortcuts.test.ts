/** Product shell shortcut policies and input/surface guards. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// The interface test harness may already register Happy DOM globally (a shared
// preload), so guard the second registration to avoid "already registered".
try {
	GlobalRegistrator.register();
} catch {
	/* already registered by harness */
}

import { beforeEach, describe, expect, it } from "bun:test";
import { useShellStore } from "../store";
import {
	buildShortcuts,
	dispatchGlobalKeydownHandlers,
	isComposing,
	isEditorSurfaceActive,
	isKeyboardOwnedSurface,
	isTypingTarget,
	registerGlobalKeydownHandler,
	shouldSkipGlobalShortcut,
} from "./global-shortcuts";

describe("single global keyboard listener — transient interaction owners", () => {
	it("dispatches a registered owner and removes it deterministically", () => {
		const calls: string[] = [];
		const unregister = registerGlobalKeydownHandler((event) => {
			calls.push(event.key);
			return event.key === "Escape";
		});

		expect(
			dispatchGlobalKeydownHandlers({ key: "Escape" } as KeyboardEvent),
		).toBe(true);
		expect(calls).toEqual(["Escape"]);

		unregister();
		expect(
			dispatchGlobalKeydownHandlers({ key: "Escape" } as KeyboardEvent),
		).toBe(false);
	});
});

describe("product shell shortcut boundary", () => {
	it("keeps Ctrl+Shift+H as the Changelog binding without owning editor hide keys", () => {
		const shortcuts = buildShortcuts();
		const changelog = shortcuts.find(
			(shortcut) => shortcut.combo === "Ctrl+Shift+H",
		);
		expect(changelog).toBeDefined();
		expect(
			changelog!.match({
				key: "h",
				code: "KeyH",
				ctrlKey: true,
				shiftKey: true,
			} as KeyboardEvent),
		).toBe(true);
		expect(shortcuts.map((shortcut) => shortcut.combo)).not.toContain("Ctrl+H");
		expect(shortcuts.map((shortcut) => shortcut.combo)).not.toContain(
			"Shift+H",
		);
	});

	it("keeps shell bindings before ordinary contributions and the palette after them", () => {
		const shortcuts = buildShortcuts();
		for (const shortcut of shortcuts)
			expect(shortcut.priority).toBe(shortcut.combo === "Ctrl+K" ? -20 : 10);
	});
});

describe("keyboard router — edit-group surface gate (ADR-0029 Phase 0)", () => {
	// The onKey wrapper skips edit-group shortcuts (letting them escape to the
	// focused component / browser) whenever isEditorSurfaceActive() is false, so
	// Remaining edit keys no longer route to a stale scene selection while the
	// user is on another Page or under an overlay.
	beforeEach(() => {
		useShellStore.setState({ activeOverlay: null });
		document.body.replaceChildren();
		const anchor = document.createElement("div");
		anchor.dataset.surfaceAnchor = "edit";
		anchor.getClientRects = () =>
			[{ width: 1, height: 1 }] as unknown as DOMRectList;
		document.body.appendChild(anchor);
	});

	it("editor Page + no overlay → active (edit keys act)", () => {
		expect(isEditorSurfaceActive()).toBe(true);
	});

	it("an overlay covering the shell → inactive (edit keys escape)", () => {
		useShellStore.setState({ activeOverlay: "settings" });
		expect(isEditorSurfaceActive()).toBe(false);
	});

	it("a non-editor Page → inactive (edit keys escape)", () => {
		document.querySelector('[data-surface-anchor="edit"]')?.remove();
		expect(isEditorSurfaceActive()).toBe(false);
	});
});

describe("keyboard router — IME / typing-target guards (AC-A5)", () => {
	it("isComposing true on keyCode 229 / isComposing / Process key", () => {
		expect(
			isComposing({
				key: "Process",
				keyCode: 229,
				isComposing: true,
			} as KeyboardEvent),
		).toBe(true);
		expect(
			isComposing({
				key: "a",
				keyCode: 0,
				isComposing: false,
			} as KeyboardEvent),
		).toBe(false);
	});

	it("isTypingTarget true for INPUT / TEXTAREA / contenteditable", () => {
		expect(
			isTypingTarget({
				target: document.createElement("input"),
			} as KeyboardEvent),
		).toBe(true);
		expect(
			isTypingTarget({
				target: document.createElement("textarea"),
			} as KeyboardEvent),
		).toBe(true);
		const ce = document.createElement("div");
		ce.setAttribute("contenteditable", "true");
		expect(isTypingTarget({ target: ce } as KeyboardEvent)).toBe(true);
	});

	it("isTypingTarget false for plain div and non-Element target (window)", () => {
		expect(
			isTypingTarget({
				target: document.createElement("div"),
			} as KeyboardEvent),
		).toBe(false);
		expect(isTypingTarget({ target: window } as unknown as KeyboardEvent)).toBe(
			false,
		);
	});

	it("preview canvas owns edit keys without swallowing non-edit global shortcuts", () => {
		const canvas = document.createElement("canvas");
		canvas.dataset.fxKeyboardSurface = "viewport-preview";
		const child = document.createElement("span");
		canvas.appendChild(child);
		const event = { target: child } as unknown as KeyboardEvent;

		expect(isKeyboardOwnedSurface(event)).toBe(true);
		expect(shouldSkipGlobalShortcut(event, { group: "edit" })).toBe(true);
		expect(shouldSkipGlobalShortcut(event, { group: "general" })).toBe(false);
	});
});
