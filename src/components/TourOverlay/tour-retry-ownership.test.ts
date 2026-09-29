import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const source = normalizeSourceStringDelimiters(
	readFileSync(new URL("./TourOverlay.tsx", import.meta.url), "utf8"),
);
const retry = source.slice(
	source.indexOf("// Measure the current step"),
	source.indexOf("// Measure the card's"),
);

describe("TourOverlay pending retry timeout ownership", () => {
	it("delegates only the pending timeout to the existing public lifecycle", () => {
		expect(source).toMatch(
			/createRestartableTimeoutTaskLifecycle[\s\S]*from '@forgeax\/app-shell\/react'/,
		);
		expect(retry).toContain("createRestartableTimeoutTaskLifecycle(");
		expect(retry).toContain(".schedule()");
		expect(retry).toContain(".dispose()");
		expect(retry).not.toMatch(/\b(?:setTimeout|clearTimeout)\s*\(/);
	});

	it("keeps synchronous first measurement, retry budget, predicate and anchor identity in Interface", () => {
		expect(retry).toContain("delayMs: 60");
		expect(retry).toContain("let attempts = 0");
		expect(retry).toContain("readAnchorRect(anchorKey.split('|'))");
		expect(retry).toContain("setAnchorRect(rect)");
		expect(retry).toContain("attempts += 1");
		expect(retry).toContain("if (rect || attempts >= 20) return");
		expect(retry).toContain("tick();");
		expect(retry).toContain("}, [anchorKey])");
	});
});
