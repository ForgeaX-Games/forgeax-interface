import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const source = normalizeSourceStringDelimiters(
	readFileSync(new URL("./OnboardingController.tsx", import.meta.url), "utf8"),
);

describe("onboarding countdown interval ownership", () => {
	it("stores a fresh public lifecycle before starting and releases the ref before disposal", () => {
		expect(source).toMatch(
			/createIntervalTaskLifecycle[\s\S]*from ["']@forgeax\/app-shell\/react["']/,
		);
		expect(source).toContain("useRef<IntervalTaskLifecycle | null>(null)");
		expect(source).toContain("intervalMs: 1000");
		expect(source).toMatch(
			/const countdown = cdRef.current;\s*cdRef.current = null;\s*countdown\?\.dispose\(\)/,
		);
		expect(source).toMatch(
			/const beginCountdown = useCallback\(\(\) => \{[\s\S]*const countdown = createIntervalTaskLifecycle\(/,
		);
		expect(source).toMatch(/cdRef.current = countdown;\s*countdown.start\(\)/);
		expect(source).not.toMatch(/\b(?:setInterval|clearInterval)\s*\(/);
	});

	it("keeps the countdown and existing synchronous and asynchronous product policy local", () => {
		expect(source).toContain("setCountdown(2)");
		expect(source).toContain("setCountdown((c) => {");
		expect(source).toContain("if (c === null) return null");
		expect(source).toContain("if (c <= 1) {");
		expect(source).toMatch(
			/clearCountdown\(\);\s*resetCheck\(\);\s*setPhase\('project'\);\s*return null/,
		);
		expect(source).toContain("return c - 1");
		expect(source).toContain("}, [resetCheck, setPhase, clearCountdown])");
		expect(source).toContain(
			"useEffect(() => () => clearCountdown(), [clearCountdown])",
		);
		expect(source).toContain("const skipConnect = useCallback(() => {");
		expect(source).toMatch(
			/const skipConnect = useCallback\(\(\) => \{\s*resetCheck\(\);\s*setPhase\('project'\);\s*\}, \[resetCheck, setPhase\]\)/,
		);
		expect(source).toContain("if (countdown !== null) {");
		expect(source).toMatch(
			/if \(countdown !== null\) \{\s*resetCheck\(\);\s*setPhase\('project'\);\s*return;\s*\}/,
		);
		expect(source).toContain(
			"await applyModelRoute({ kind: 'cli', providerId: cli })",
		);
		expect(source).toMatch(
			/await applyModelRoute\(\{\s*kind: 'api-key',\s*model: OB_API_KEY_DEFAULT_MODEL,?\s*\}\)/,
		);
		expect(source).toContain("import './Onboarding.css'");
	});
});
