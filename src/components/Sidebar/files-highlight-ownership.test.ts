import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const source = normalizeSourceStringDelimiters(
	readFileSync(new URL("./FilesPanel.tsx", import.meta.url), "utf8"),
);
const view = source.slice(
	source.indexOf("function FilesPanelView("),
	source.indexOf("interface RowProps"),
);

describe("FilesPanel highlight timeout ownership", () => {
	it("delegates replacement and disposal to the existing public lifecycle", () => {
		expect(source).toMatch(
			/createRestartableTimeoutTaskLifecycle[\s\S]*from '@forgeax\/app-shell\/react'/,
		);
		expect(view).toContain("createRestartableTimeoutTaskLifecycle(");
		expect(view).toContain(".schedule()");
		expect(view).toContain(".dispose()");
		expect(view).not.toMatch(/\b(?:setTimeout|clearTimeout)\s*\(/);
	});

	it("retains path policy, post-commit lookup, scroll, focus and polling cadence", () => {
		expect(view).toContain("delayMs: 1500");
		expect(view).toContain("cur === path ? null : cur");
		expect(view).toContain("CSS.escape(pendingScrollPath)");
		expect(view).toContain(
			"el.scrollIntoView({ block: 'center', behavior: 'smooth' })",
		);
		expect(view).toContain("el.focus({ preventScroll: true })");
		expect(view).toContain("[pendingScrollPath, expanded]");
		expect(view).toContain("ancestorsOf(fam.firstPath, tree.path)");
		expect(source).toContain("intervalMs: 5_000");
		expect(source).toMatch(/task:\s*\(\) =>\s*\{\s*void load\(\);\s*\}/);
	});
});
