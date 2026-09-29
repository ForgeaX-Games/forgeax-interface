import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

const source = normalizeSourceStringDelimiters(
	readFileSync(new URL("./use-extension-manifest.ts", import.meta.url), "utf8"),
);

describe("extension manifest retry timeout ownership", () => {
	it("delegates the pending timeout to the existing App Shell lifecycle", () => {
		expect(source).toMatch(
			/createRestartableTimeoutTaskLifecycle[\s\S]*from '@forgeax\/app-shell\/react'/,
		);
		expect(source).toContain("createRestartableTimeoutTaskLifecycle(");
		expect(source).toContain("delayMs: POLL_MS");
		expect(source).toContain(".schedule()");
		expect(source).toContain(".dispose()");
		expect(source).not.toMatch(/\b(?:setTimeout|clearTimeout)\s*\(/);
	});

	it("retains the async request, cache, identity, result and retry policies in Interface", () => {
		expect(source).toContain("const MAX_ATTEMPTS = 15");
		expect(source).toContain("const POLL_MS = 1500");
		expect(source).toContain(
			"await listExtensionsShared({ force: attempts > 1 })",
		);
		expect(source).toContain("manifestMatchesId(p, extensionId)");
		expect(source).toMatch(
			/found\?\.frontendUrl\s*\|\|\s*found\?\.entry\?\.standalone\s*\|\|\s*found\?\.entry\?\.frontend/,
		);
		expect(source).toContain("if (cancelled) return");
		expect(source).toContain("cancelled = true");
		expect(source).toContain("void tick()");
		expect(source).toContain("}, [extensionId])");
	});
});
