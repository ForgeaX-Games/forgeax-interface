import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const source = normalizeSourceStringDelimiters(
	readFileSync(new URL("./StripHostView.tsx", import.meta.url), "utf8"),
);

describe("status strip interval ownership", () => {
	it("delegates contribution presentation and periodic ownership to App Shell", () => {
		expect(source).toMatch(
			/StatusStrip[\s\S]*from '@forgeax\/app-shell\/react'/,
		);
		expect(source).toContain("intervalMs={CAROUSEL_INTERVAL_MS}");
		expect(source).toContain("items={renderers.stripItems}");
		expect(source).not.toMatch(/\b(?:setInterval|clearInterval)\s*\(/);
	});

	it("retains cadence, slot capacity and presentation policy", () => {
		expect(source).toContain("const CAROUSEL_INTERVAL_MS = 4000");
		expect(source).toMatch(/left:\s*4,\s*center:\s*2,\s*right:\s*6/);
		expect(source).toContain("capacity={VISIBLE_PER_SLOT}");
		expect(source).toContain("visualOrder={VISUAL_ORDER}");
		expect(source).toContain('aria-label="forgeax status bar"');
		expect(source).toContain("host.commands.execute(id, args)");
		expect(source).toContain("import './GlobalStatusBar.css'");
	});
});
