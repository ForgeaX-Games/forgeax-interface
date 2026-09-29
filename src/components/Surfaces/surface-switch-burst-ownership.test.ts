import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const source = normalizeSourceStringDelimiters(
	readFileSync(new URL("./SurfaceKeepAliveLayer.tsx", import.meta.url), "utf8"),
);

describe("surface switch-burst frame ownership", () => {
	it("uses a separate public frame lifecycle for the burst", () => {
		expect(source).toContain(
			"const burstFrameTask = createCoalescedFrameTaskLifecycle({",
		);
		expect(source).toContain("if (++frames < 30) burstFrameTask.schedule()");
		expect(source).toContain("burstFrameTask.dispose()");
		expect(source).not.toMatch(
			/\b(?:requestAnimationFrame|cancelAnimationFrame|burstRaf)\b/,
		);
		expect(source.indexOf("layoutFrameTask.dispose()")).toBeLessThan(
			source.indexOf("burstFrameTask.dispose()"),
		);
	});

	it("retains product policy and independent observation and settle owners", () => {
		expect(source).toContain("let frames = 0");
		expect(source).toContain(
			"const layoutFrameTask = createCoalescedFrameTaskLifecycle({",
		);
		expect(source).toContain("const SETTLE_TICKS = 4");
		expect(source).toContain("const SETTLE_STEP_MS = 60");
		expect(source).toContain("delayMs: (index + 1) * SETTLE_STEP_MS");
		expect(source).toContain("task: scheduleSync");
		expect(source).toContain(
			"const offRelayout = subscribeRelayout(scheduleSync)",
		);
		expect(source).toContain("onElementsChanged: syncLayout");
		expect(source).toContain("}, [activeKind])");
		expect(source).toContain("import './SurfaceKeepAlive.css'");
	});
});
