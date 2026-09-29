import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

const readSource = (path: string): string =>
	normalizeSourceStringDelimiters(
		readFileSync(new URL(path, import.meta.url), "utf8"),
	);

describe("surface-overlay event observation ownership", () => {
	it("delegates transport lifecycle to the shared Interface UI-event owner", () => {
		for (const path of ["./Surfaces/SurfaceOverlay.tsx"]) {
			const source = readSource(path);
			expect(source).toMatch(
				/subscribeUiEvents[\s\S]*from '\.\.\/\.\.\/lib\/ui-event-stream'/,
			);
			expect(source).toContain("subscribeUiEvents('plugin.reloaded'");
			expect(source).not.toContain("new EventSource(");
			expect(source).not.toContain("new WebSocket(");
		}
	});

	it("retains reload interpretation and product state locally", () => {
		const surface = readSource("./Surfaces/SurfaceOverlay.tsx");
		expect(surface).toContain("void reload();");
		expect(surface).toContain("if (!cancelled) setTools(next)");
		expect(surface).toContain("cancelled = true");
		expect(surface).toContain("unsubscribe();");
		expect(surface).toContain("}, [open]);");
	});
});
