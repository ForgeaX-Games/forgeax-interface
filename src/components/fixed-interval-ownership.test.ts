import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

const readSource = (path: string): string =>
	normalizeSourceStringDelimiters(
		readFileSync(new URL(path, import.meta.url), "utf8"),
	);

const owners = [
	{ path: "./Sidebar/FilesPanel.tsx", count: 1 },
	{ path: "./StatusBar/footer/ForgeaxBuildPopover.tsx", count: 1 },
] as const;

describe("remaining React fixed interval ownership", () => {
	it("delegates both balanced registrations to the published App Shell lifecycle", () => {
		for (const owner of owners) {
			const source = readSource(owner.path);
			expect(source).toMatch(
				/createIntervalTaskLifecycle[\s\S]*from '@forgeax\/app-shell\/react'/,
			);
			expect(source.match(/createIntervalTaskLifecycle\(\{/g)).toHaveLength(
				owner.count,
			);
			expect(source.match(/poll\.start\(\)/g)).toHaveLength(owner.count);
			expect(source.match(/poll\.dispose\(\)/g)).toHaveLength(owner.count);
			expect(source).not.toMatch(/\b(?:setInterval|clearInterval)\s*\(/);
		}
	});

	it("retains initial work, cadence, cancellation fencing and product refresh sources", () => {
		const files = readSource("./Sidebar/FilesPanel.tsx");
		expect(files).toContain("load();");
		expect(files).toContain("intervalMs: 5_000");
		expect(files).toContain("cancelled = true");
		expect(files).toContain("}, [activeSlug])");

		const build = readSource("./StatusBar/footer/ForgeaxBuildPopover.tsx");
		expect(build).toContain("refresh();");
		expect(build).toContain("intervalMs: 60_000");
		expect(build).toContain(
			"document.addEventListener('visibilitychange', onVisibility)",
		);
		expect(build).toContain("window.addEventListener('focus', refresh)");
		expect(build).toContain("cancelled = true");
	});
});
