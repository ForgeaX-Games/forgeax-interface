import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

function readSource(path: string): string {
	return normalizeSourceStringDelimiters(
		readFileSync(new URL(path, import.meta.url), "utf8"),
	);
}

const uiBridgeSource = readSource("../lib/ui-bridge.ts");
const vagBridgeSource = readSource("../lib/vag-action-bridge.ts");
const healthBridgeSource = readSource("./StatusBar/healthBridge.ts");

const owners = [
	{ name: "iframe shortcut receiver", source: uiBridgeSource },
	{ name: "VAG action bridge", source: vagBridgeSource },
	{ name: "health bridge", source: healthBridgeSource },
];

const directWindowMessageRegistration = new RegExp(
	String.raw`\b(?:window|globalThis(?:\s*\.\s*window)?)\s*\.\s*` +
		String.raw`(?:addEventListener\s*\(\s*(['"])message\1|onmessage\s*=)`,
	"s",
);

function containsDirectWindowMessageRegistration(source: string): boolean {
	return directWindowMessageRegistration.test(source);
}

describe("process-lifetime window message ownership", () => {
	it("delegates the remaining Interface owners to the published App Shell observation", async () => {
		for (const owner of owners) {
			expect(owner.source, owner.name).toMatch(
				/installWindowMessageObservation[\s\S]*from '@forgeax\/app-shell\/react'/,
			);
			expect(
				owner.source.match(/void installWindowMessageObservation\(\{/g) ?? [],
				owner.name,
			).toHaveLength(1);
			expect(
				containsDirectWindowMessageRegistration(owner.source),
				owner.name,
			).toBe(false);
			expect(owner.source, owner.name).not.toContain(
				"window.removeEventListener('message'",
			);
		}

		const remainingDirectOwners: string[] = [];
		const sourceGlob = new Bun.Glob("**/*.{ts,tsx}");
		for await (const path of sourceGlob.scan({
			cwd: new URL("..", import.meta.url).pathname,
		})) {
			if (path.includes(".test.") || path.includes(".spec.")) continue;
			const source = readSource(`../${path}`);
			if (containsDirectWindowMessageRegistration(source))
				remainingDirectOwners.push(path);
		}
		expect(remainingDirectOwners).toEqual([]);
	});

	it("detects alternate direct-registration syntax instead of guarding one literal spelling", () => {
		const directVariants = [
			'window.addEventListener("message", handler);',
			"window\n  .addEventListener(\n    'message', handler);",
			"globalThis.window.addEventListener('message', handler);",
			"globalThis.addEventListener('message', handler);",
			"window.onmessage = handler;",
		];

		for (const source of directVariants) {
			expect(containsDirectWindowMessageRegistration(source), source).toBe(
				true,
			);
		}
		expect(
			containsDirectWindowMessageRegistration(
				"target.addEventListener('message', handler);",
			),
		).toBe(false);
	});

	it("retains process guards and all origin, payload and product policies locally", () => {
		expect(uiBridgeSource).toContain("if (shortcutReceiverInstalled");
		expect(uiBridgeSource).toContain("isTrustedMessageOrigin(e.origin)");
		expect(uiBridgeSource).toContain("d.type !== FORGEAX_FORWARD_KEY");
		expect(uiBridgeSource).toMatch(
			/\bwindow\.dispatchEvent\s*\(\s*new KeyboardEvent\s*\(\s*'keydown'/,
		);

		expect(vagBridgeSource).toContain("if (installed || typeof window");
		expect(vagBridgeSource).toContain("isTrustedMessageOrigin(e.origin)");
		expect(vagBridgeSource).toContain("data.type === 'VAG_ACTION_MANIFEST'");
		expect(vagBridgeSource).toContain("data.type === 'VAG_ACTION_RESULT'");

		expect(healthBridgeSource).toContain("if (installed) return;");
		expect(healthBridgeSource).toContain("isTrustedMessageOrigin(ev.origin)");
		expect(healthBridgeSource).toContain("type === 'forgeax:health'");
		expect(healthBridgeSource).toContain("ingestVagTelemetry(data)");
	});
});
