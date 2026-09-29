import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

const readSource = (path: string): string =>
	normalizeSourceStringDelimiters(
		readFileSync(new URL(path, import.meta.url), "utf8"),
	);

describe("settled polling ownership", () => {
	it("delegates the two exact settled polling owners to the published App Shell lifecycle", () => {
		for (const path of [
			"./shell-live-data.ts",
			"../components/StatusBar/footer/CheckpointsDrawer.tsx",
		]) {
			const source = readSource(path);
			expect(source).toMatch(
				/createSettledPollingLifecycle[\s\S]*from '@forgeax\/app-shell\/react'/,
			);
			expect(source).toContain("createSettledPollingLifecycle({");
			expect(source).toContain(".start();");
			expect(source).toContain(".dispose");
			expect(source).not.toContain("startResilientPoll");
		}
	});

	it("leaves extension interpretation local while removing Interface timer and abort ownership", () => {
		const source = readSource("./resilient-polling.ts");
		expect(source).toContain("export function deriveExtensionKindCounts(");
		expect(source).not.toContain("startResilientPoll");
		expect(source).not.toMatch(
			/\b(?:setTimeout|clearTimeout|AbortController)\b/,
		);
	});
});
