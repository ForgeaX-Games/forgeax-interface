import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const panel = readFileSync(
	new URL("./PanelShell.tsx", import.meta.url),
	"utf8",
);
const palette = readFileSync(
	new URL("../CommandPalette/CommandPalette.tsx", import.meta.url),
	"utf8",
);
const overflow = panel.slice(
	panel.indexOf("function OverflowMenu("),
	panel.indexOf("const DEFAULT_OVERFLOW_PRIORITY"),
);

describe("delayed-close ownership", () => {
	it("delegates both balanced timeout owners to the public App Shell lifecycle", () => {
		for (const source of [panel, palette]) {
			expect(source).toMatch(
				/createRestartableTimeoutTaskLifecycle[\s\S]*from ["']@forgeax\/app-shell\/react["']/,
			);
		}
		for (const source of [overflow, palette]) {
			expect(source).toContain("createRestartableTimeoutTaskLifecycle(");
			expect(source).toContain(".schedule()");
			expect(source).toContain(".cancel()");
			expect(source).toContain(".dispose()");
			expect(source).not.toMatch(/\b(?:setTimeout|clearTimeout)\s*\(/);
		}
	});

	it("retains Interface delays, lock policy, reset behavior and pointer triggers", () => {
		expect(overflow).toContain("delayMs: 180");
		expect(overflow).toContain("if (!lockedRef.current) setOpen(false)");
		expect(overflow).toContain("onPointerLeave={scheduleClose}");
		expect(overflow).toContain("onPointerEnter={clearClose}");
		expect(palette).toContain("delayMs: 1100");
		expect(palette).toContain("setCommandPaletteOpen(false)");
		expect(palette).toContain("setFormDef(null)");
		expect(palette).toContain("setValues({})");
		expect(palette).toContain("setFeedback(null)");
	});
});
