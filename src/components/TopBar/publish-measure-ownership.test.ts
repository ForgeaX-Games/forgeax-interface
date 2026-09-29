import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const source = normalizeSourceStringDelimiters(
	readFileSync(new URL("./PublishOnboarding.tsx", import.meta.url), "utf8"),
);
const effect = source.slice(
	source.indexOf("useLayoutEffect(() => {"),
	source.indexOf("const finish ="),
);

describe("publish onboarding measurement ownership", () => {
	it("uses separate public timeout owners without owning native handles", () => {
		expect(
			effect.match(/createRestartableTimeoutTaskLifecycle\(/g),
		).toHaveLength(2);
		expect(effect).not.toMatch(/\b(?:setTimeout|clearTimeout)\(/);
		expect(effect).toContain("initialTask.schedule()");
		expect(effect).toContain("initialTask.dispose()");
		expect(effect).toContain("retryTask.dispose()");
	});

	it("retains the first delay, bounded synchronous predicate, retry delay and dependencies", () => {
		expect(effect).toContain("if (!active || !step) return");
		expect(effect).toContain("let tries = 0");
		expect(effect).toContain("if (measure()) return");
		expect(effect).toContain("if (tries++ < 12) retryTask.schedule()");
		expect(effect).toContain("delayMs: step.menu ? 150 : 20");
		expect(effect).toContain("delayMs: 45");
		expect(effect).toContain("[active, step, measure]");
	});
});
