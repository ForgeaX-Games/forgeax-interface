import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const source = normalizeSourceStringDelimiters(
	readFileSync(new URL("./PassiveFeedback.tsx", import.meta.url), "utf8"),
);

describe("passive feedback fixed interval ownership", () => {
	it("delegates only the repeating lag observation registration and disposal", () => {
		expect(source).toMatch(
			/createIntervalTaskLifecycle[\s\S]*from '@forgeax\/app-shell\/react'/,
		);
		expect(source).toContain("intervalMs: 1_000");
		expect(source).toContain("heartbeat.start()");
		expect(source).toContain("heartbeat.dispose()");
		expect(source).not.toMatch(
			/(?:const heartbeat = window\.setInterval|window\.clearInterval\(heartbeat\))/,
		);
	});

	it("retains the performance clock, lag policy and adjacent subscriptions", () => {
		expect(source).toContain("let expected = performance.now() + 1_000");
		expect(source).toContain("const now = performance.now()");
		expect(source).toContain("const drift = now - expected");
		expect(source).toContain("expected = now + 1_000");
		expect(source).toContain(
			"if (document.visibilityState === 'visible' && drift >= 5_000)",
		);
		expect(source).toContain("durationMs: drift");
		expect(source).toContain("Math.round(drift / 1_000)");
		expect(source).toContain(
			"const unsubscribe = useHealthStore.subscribe(ingestHealth)",
		);
		expect(source).toContain("unsubscribe()");
		expect(source).toContain("}, [classifier, enqueue])");
		expect(source).toContain("import './PassiveFeedback.css'");
	});
});
