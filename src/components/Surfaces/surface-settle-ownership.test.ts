import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const source = normalizeSourceStringDelimiters(
	readFileSync(new URL("./SurfaceKeepAliveLayer.tsx", import.meta.url), "utf8"),
);

describe("surface settle timeout ownership", () => {
	it("uses four independent public timeout owners with separate batch cancellation and scheduling", () => {
		expect(source).toContain("createRestartableTimeoutTaskLifecycle,");
		expect(source).toContain("Array.from({ length: SETTLE_TICKS }");
		expect(source).toContain("delayMs: (index + 1) * SETTLE_STEP_MS");
		expect(source).toContain("task: scheduleSync");
		expect(source).toContain(
			"for (const timer of settleTimers) timer.cancel()",
		);
		expect(source).toMatch(
			/scheduleSync\(\);\s*cancelSettle\(\);\s*for \(const timer of settleTimers\) timer.schedule\(\)/,
		);
		expect(source).toMatch(
			/disposeVisualViewportResizeObservation\(\);\s*for \(const timer of settleTimers\) timer.dispose\(\);\s*disposeAnchorResizeObservation\(\)/,
		);
		expect(source).not.toMatch(/\b(?:setTimeout|clearTimeout)\s*\(/);
	});

	it("retains the product settle policy, observation sources and independent frame owners", () => {
		expect(source).toContain("const SETTLE_TICKS = 4");
		expect(source).toContain("const SETTLE_STEP_MS = 60");
		expect(source).toContain("onResize: onWin");
		expect(source).toContain("onScroll: onWin");
		expect(source).toContain("const visualViewport = window.visualViewport");
		expect(source).toContain("onElementsChanged: syncLayout");
		expect(source).toContain(
			"const offRelayout = subscribeRelayout(scheduleSync)",
		);
		expect(source).toContain("if (++frames < 30) burstFrameTask.schedule()");
		expect(source).toContain("layoutFrameTask.dispose()");
		expect(source).toContain("burstFrameTask.dispose()");
		expect(source).toContain("}, [activeKind])");
		expect(source).toContain("import './SurfaceKeepAlive.css'");
	});
});
