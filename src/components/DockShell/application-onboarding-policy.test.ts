import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	type ApplicationOnboardingOptions,
	isApplicationOnboardingEnabled,
} from "../../ApplicationShell";
import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const source = normalizeSourceStringDelimiters(
	readFileSync(new URL("../../ApplicationShell.tsx", import.meta.url), "utf8"),
);

describe("application onboarding policy", () => {
	test("defaults to enabled and accepts an explicit product opt-out", () => {
		expect(isApplicationOnboardingEnabled()).toBe(true);
		expect(isApplicationOnboardingEnabled({})).toBe(true);
		expect(isApplicationOnboardingEnabled({ enabled: true })).toBe(true);
		expect(isApplicationOnboardingEnabled({ enabled: false })).toBe(false);

		const disabled: ApplicationOnboardingOptions = { enabled: false };
		expect(disabled.enabled).toBe(false);
	});

	test("keeps the shell visible, omits the onboarding flow, and retains the model prompt", () => {
		expect(source).toContain(
			"const onboardingEnabled = isApplicationOnboardingEnabled(onboarding);",
		);
		expect(source).toMatch(/const shellHidden\s*=\s*onboardingEnabled\s*&&/);
		expect(source).toMatch(
			/\{onboardingEnabled\s*&&\s*\(\s*<OnboardingController\s+tourEnabled=\{onboarding\?\.tourEnabled\}\s*\/>\s*\)\}\s*<ConnectModelPrompt\s*\/>/,
		);
		expect(source).not.toMatch(
			/<\>\s*<OnboardingController\s+tourEnabled=\{onboarding\?\.tourEnabled\}\s*\/>\s*<ConnectModelPrompt\s*\/>\s*<\/>/,
		);
	});
});
