import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

function readSource(path: string): string {
	return normalizeSourceStringDelimiters(
		readFileSync(new URL(path, import.meta.url), "utf8"),
	);
}

const i18nSource = readSource("../i18n/standalone.ts");
const highlightSource = readSource("../lib/ui-action-highlight.ts");

const owners = [
	{ name: "same-frame locale sync", source: i18nSource },
	{ name: "AI action highlight", source: highlightSource },
];

const productEventArgument =
	String.raw`(?:` +
	String.raw`LOCALE_CHANGED_EVENT|UI_ACTION_DISPATCH_EVENT|` +
	String.raw`['"]forgeax:(?:locale-changed|ui-action-dispatch)['"]` +
	String.raw`)`;
const directProductEventRegistration = new RegExp(
	String.raw`\b(?:window|globalThis(?:\s*\.\s*window)?)\s*\.\s*` +
		String.raw`addEventListener\s*\(\s*${productEventArgument}`,
	"s",
);

function containsDirectProductEventRegistration(source: string): boolean {
	return directProductEventRegistration.test(source);
}

describe("process-lifetime custom-event observation ownership", () => {
	it("delegates the complete two-owner set to the published App Shell observation", async () => {
		for (const owner of owners) {
			expect(owner.source, owner.name).toMatch(
				/installCustomEventObservation[\s\S]*from '@forgeax\/app-shell\/react'/,
			);
			expect(
				owner.source.match(/void installCustomEventObservation\(\{/g) ?? [],
				owner.name,
			).toHaveLength(1);
			expect(
				containsDirectProductEventRegistration(owner.source),
				owner.name,
			).toBe(false);
		}

		const remainingDirectOwners: string[] = [];
		const sourceGlob = new Bun.Glob("**/*.{ts,tsx}");
		for await (const path of sourceGlob.scan({
			cwd: new URL("..", import.meta.url).pathname,
		})) {
			if (path.includes(".test.") || path.includes(".spec.")) continue;
			const source = readSource(`../${path}`);
			if (containsDirectProductEventRegistration(source))
				remainingDirectOwners.push(path);
		}
		expect(remainingDirectOwners).toEqual([]);
	});

	it("detects alternate direct-registration syntax instead of one literal spelling", () => {
		const directVariants = [
			"window.addEventListener(LOCALE_CHANGED_EVENT, handler);",
			"window\n  .addEventListener(\n    UI_ACTION_DISPATCH_EVENT, handler);",
			"globalThis.window.addEventListener(LOCALE_CHANGED_EVENT, handler);",
			"globalThis.addEventListener(UI_ACTION_DISPATCH_EVENT, handler);",
			'window.addEventListener("forgeax:locale-changed", handler);',
			"window.addEventListener('forgeax:ui-action-dispatch', handler);",
		];

		for (const source of directVariants) {
			expect(containsDirectProductEventRegistration(source), source).toBe(true);
		}
		expect(
			containsDirectProductEventRegistration(
				"target.addEventListener(UI_ACTION_DISPATCH_EVENT, handler);",
			),
		).toBe(false);
		expect(
			containsDirectProductEventRegistration(
				"window.addEventListener('focus', handler);",
			),
		).toBe(false);
	});

	it("retains every process guard, event identity and product reaction locally", () => {
		expect(i18nSource).toContain(
			"const LOCALE_CHANGED_EVENT = 'forgeax:locale-changed'",
		);
		expect(i18nSource).toContain(
			"if (!storageWired && typeof window !== 'undefined')",
		);
		expect(i18nSource).toContain("storageWired = true");
		expect(i18nSource).toContain(
			"setLocale(readPersisted(), { persist: false })",
		);
		expect(i18nSource).toContain(
			"new CustomEvent(LOCALE_CHANGED_EVENT, { detail: next })",
		);

		expect(highlightSource).toMatch(
			/import\s*\{(?=[^}]*\bUI_ACTION_DISPATCH_EVENT\b)(?=[^}]*\bgetAction\b)[^}]*\}\s*from\s*'@forgeax\/app-shell\/application'/,
		);
		expect(highlightSource).toContain(
			"if (installed || typeof document === 'undefined') return;",
		);
		expect(highlightSource).toContain("installed = true");
		expect(highlightSource).toContain("ensureStyle()");
		expect(highlightSource).toContain("detail.source !== 'ai'");
		expect(highlightSource).toContain("data-fx-action");
		expect(highlightSource).toContain("flashElement(el)");
		expect(highlightSource).toContain("showBadge(`AI 正在:${title}`)");
	});
});
