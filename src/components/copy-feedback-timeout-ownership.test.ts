import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

function readSource(path: string): string {
	return normalizeSourceStringDelimiters(
		readFileSync(new URL(path, import.meta.url), "utf8"),
	);
}

function sliceBetween(source: string, start: string, end?: string): string {
	const startIndex = source.indexOf(start);
	const endIndex = end
		? source.indexOf(end, startIndex + start.length)
		: source.length;
	if (startIndex < 0 || endIndex < 0)
		throw new Error(`missing source boundary: ${start} -> ${end ?? "<eof>"}`);
	return source.slice(startIndex, endIndex);
}

const infoSource = readSource("./StatusBar/InfoPanel.tsx");
const topBarSource = readSource("./TopBar/TopBar.tsx");

const owners = [
	{
		name: "INFO row and all",
		source: sliceBetween(infoSource, "export function InfoPanel()"),
		lifecycleCount: 2,
	},
	{
		name: "package path and command",
		source: sliceBetween(
			topBarSource,
			"function PackageSuccessBody(",
			"// ── PackageProgressOverlay ──",
		),
		lifecycleCount: 1,
	},
];

describe("copy feedback timeout ownership", () => {
	it("delegates all three component-scoped reset timers to the published App Shell lifecycle", () => {
		for (const source of [infoSource, topBarSource]) {
			expect(source).toMatch(
				/createRestartableTimeoutTaskLifecycle[\s\S]*from '@forgeax\/app-shell\/react'/,
			);
		}

		for (const owner of owners) {
			expect(
				owner.source.match(/createRestartableTimeoutTaskLifecycle\(/g) ?? [],
				owner.name,
			).toHaveLength(owner.lifecycleCount);
			expect(
				owner.source.match(/\.schedule\(\)/g) ?? [],
				owner.name,
			).toHaveLength(owner.lifecycleCount);
			expect(
				owner.source.match(/\.dispose\(\)/g) ?? [],
				owner.name,
			).toHaveLength(owner.lifecycleCount);
			expect(owner.source, owner.name).not.toMatch(
				/\b(?:setTimeout|clearTimeout)\s*\(/,
			);
		}
	});

	it("retains copy mechanisms, independent product state, delays and presentation locally", () => {
		expect(owners[0]!.source).toContain("entryToText(ce.entry, ce.count)");
		expect(owners[0]!.source).toContain("setCopiedKey(ce.key)");
		expect(owners[0]!.source).toContain("setAllCopied(true)");
		expect(owners[0]!.source.match(/delayMs: 900/g) ?? []).toHaveLength(2);

		expect(owners[1]!.source).toContain("which: 'path' | 'cmd'");
		expect(owners[1]!.source).toContain("navigator.clipboard.writeText(text)");
		expect(owners[1]!.source).toContain("delayMs: 1600");
	});
});
