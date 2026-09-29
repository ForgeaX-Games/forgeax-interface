import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

function readSource(path: string): string {
	return normalizeSourceStringDelimiters(
		readFileSync(new URL(path, import.meta.url), "utf8"),
	);
}

const storeSource = readSource("../store-compatibility.ts");
const i18nSource = readSource("../i18n/standalone.ts");
const browserPrefsSource = readSource("../lib/browser-prefs-sync.ts");
const configInvalidationSource = readSource("../lib/config-invalidation.ts");

const owners = [
	{
		name: "shell preference sync",
		source: storeSource,
		expectedInstallations: 2,
	},
	{ name: "locale sync", source: i18nSource, expectedInstallations: 1 },
	{
		name: "browser preference snapshot sync",
		source: browserPrefsSource,
		expectedInstallations: 1,
	},
	{
		name: "config invalidation sync",
		source: configInvalidationSource,
		expectedInstallations: 1,
	},
];

const directWindowStorageRegistration = new RegExp(
	String.raw`\b(?:window|globalThis(?:\s*\.\s*window)?)\s*\.\s*` +
		String.raw`(?:addEventListener\s*\(\s*(['"])storage\1|onstorage\s*=)`,
	"s",
);

function containsDirectWindowStorageRegistration(source: string): boolean {
	return directWindowStorageRegistration.test(source);
}

describe("process-lifetime storage observation ownership", () => {
	it("delegates the complete four-owner set to the published App Shell observation", async () => {
		for (const owner of owners) {
			expect(owner.source, owner.name).toMatch(
				/installStorageObservation[\s\S]*from '@forgeax\/app-shell\/react'/,
			);
			expect(
				owner.source.match(/(?:void )?installStorageObservation\(\{/g) ?? [],
				owner.name,
			).toHaveLength(owner.expectedInstallations);
			expect(
				containsDirectWindowStorageRegistration(owner.source),
				owner.name,
			).toBe(false);
			expect(owner.source, owner.name).not.toContain(
				"window.removeEventListener('storage'",
			);
		}

		const remainingDirectOwners: string[] = [];
		const sourceGlob = new Bun.Glob("**/*.{ts,tsx}");
		for await (const path of sourceGlob.scan({
			cwd: new URL("..", import.meta.url).pathname,
		})) {
			if (path.includes(".test.") || path.includes(".spec.")) continue;
			const source = readSource(`../${path}`);
			if (containsDirectWindowStorageRegistration(source))
				remainingDirectOwners.push(path);
		}
		expect(remainingDirectOwners).toEqual([]);
	});

	it("detects alternate direct-registration syntax instead of guarding one literal spelling", () => {
		const directVariants = [
			'window.addEventListener("storage", handler);',
			"window\n  .addEventListener(\n    'storage', handler);",
			"globalThis.window.addEventListener('storage', handler);",
			"globalThis.addEventListener('storage', handler);",
			"window.onstorage = handler;",
		];

		for (const source of directVariants) {
			expect(containsDirectWindowStorageRegistration(source), source).toBe(
				true,
			);
		}
		expect(
			containsDirectWindowStorageRegistration(
				"target.addEventListener('storage', handler);",
			),
		).toBe(false);
	});

	it("retains every process guard, storage policy and product reaction locally", () => {
		expect(
			storeSource.match(/if \(typeof window !== 'undefined'\)/g) ?? [],
		).toHaveLength(2);
		expect(storeSource).toContain("e.key !== 'forgeax.providerOverride'");
		expect(storeSource).toContain("providerOverride: next");
		expect(storeSource).toContain(
			"patchTabField(state, state.activeSid, { providerOverride: next })",
		);
		expect(storeSource).toContain("e.key === STORAGE_KEYS.replyLanguage");
		expect(storeSource).toContain(
			"useShellStore.setState({ replyLanguage: next })",
		);
		expect(storeSource).toContain("e.key === STORAGE_KEYS.followInput");
		expect(storeSource).toContain(
			"useShellStore.setState({ followInput: next })",
		);

		expect(i18nSource).toContain("if (!storageWired");
		expect(i18nSource).toContain("storageWired = true");
		expect(i18nSource).toContain("!e.key || e.key === STORAGE_KEYS.locale");
		expect(i18nSource).toContain(
			"setLocale(readPersisted(), { persist: false })",
		);
		expect(i18nSource).toContain("eventType: LOCALE_CHANGED_EVENT");

		expect(browserPrefsSource).toContain(
			"if (started || typeof window === 'undefined') return;",
		);
		expect(browserPrefsSource).toContain("started = true");
		expect(browserPrefsSource).toContain("e.key && shouldSyncKey(e.key)");
		expect(browserPrefsSource).toContain("schedulePush()");
		expect(
			browserPrefsSource.match(
				/window\.addEventListener\((['"])beforeunload\1/g,
			) ?? [],
		).toHaveLength(2);
		expect(browserPrefsSource).toContain("window.setInterval");
		expect(browserPrefsSource).toContain("window.setTimeout");

		expect(configInvalidationSource).toContain(
			"if (event.key !== KEY || !event.newValue) return;",
		);
		expect(configInvalidationSource).toContain(
			"JSON.parse(event.newValue).resource === resource",
		);
		expect(configInvalidationSource).toContain("disposeStorageObservation();");
	});
});
