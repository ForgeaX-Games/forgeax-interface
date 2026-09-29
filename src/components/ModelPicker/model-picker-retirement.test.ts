import { describe, expect, test } from "bun:test";
import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

describe("Chat-owned ModelPicker presentation retirement", () => {
	test("removes Interface presentation and type exports while retaining the catalog hook export", async () => {
		const picker = Bun.file(new URL("./ModelPicker.tsx", import.meta.url));
		const styles = Bun.file(new URL("./ModelPicker.css", import.meta.url));
		const indexSource = normalizeSourceStringDelimiters(
			await Bun.file(new URL("./index.ts", import.meta.url)).text(),
		);
		const packageJson = await Bun.file(
			new URL("../../../package.json", import.meta.url),
		).json();

		expect(await picker.exists()).toBe(false);
		expect(await styles.exists()).toBe(false);
		expect(indexSource).not.toContain("from './ModelPicker'");
		expect(indexSource).not.toContain("ModelPickerProps");
		expect(indexSource).not.toContain("ModelPickerWriteTarget");
		expect(indexSource).toMatch(
			/export\s*\{(?=[^}]*\buseModelCatalog\b)(?=[^}]*\b_resetModelCatalogCache\b)[^}]*\}\s*from\s*'\.\/useModelCatalog'/,
		);
		expect(packageJson.exports["./components/ModelPicker"]).toEqual({
			types: "./dist/package/browser/components/ModelPicker/index.d.ts",
			browser: "./dist/package/browser/components/ModelPicker/index.js",
			import: "./dist/package/node/components/ModelPicker/index.js",
		});
	});

	test("keeps cache, inflight dedupe, subscribers, force refresh, and onboarding refresh identity", async () => {
		const hookSource = normalizeSourceStringDelimiters(
			await Bun.file(new URL("./useModelCatalog.ts", import.meta.url)).text(),
		);
		const onboardingSource = normalizeSourceStringDelimiters(
			await Bun.file(
				new URL("../Onboarding/OnboardingController.tsx", import.meta.url),
			).text(),
		);

		expect(hookSource).toContain(
			"const cached = new Map<string, ModelCatalogWithMeta>();",
		);
		expect(hookSource).toContain(
			"const inflight = new Map<string, Promise<ModelCatalogWithMeta>>();",
		);
		expect(hookSource).toMatch(
			/const subscribers\s*=\s*new Map<\s*string\s*,\s*Set<\s*\(payload:\s*ModelCatalogWithMeta\)\s*=>\s*void\s*>\s*>\s*\(\s*\)/,
		);
		expect(hookSource).toMatch(
			/async function fetchOnce\s*\(\s*providerId\?\s*:\s*string\s*\|\s*null\s*,\s*force\s*=\s*false\s*,?\s*\)/,
		);
		// A recalled offline catalog can render immediately but must not suppress
		// the next live lookup; only a live cache is authoritative for dedupe.
		expect(hookSource).toContain(
			"if (hit && !hit.offline && !force) return hit;",
		);
		expect(hookSource).toContain("recalledModelCatalog(providerId)");
		expect(hookSource).toMatch(
			/export function useModelCatalog\s*\(\s*providerId\?\s*:\s*string\s*\|\s*null\s*\)\s*:\s*ModelCatalogState/,
		);
		expect(hookSource).toContain(
			"export async function refreshAllModelCatalogs(): Promise<void>",
		);
		expect(hookSource).toMatch(
			/fetchOnce\s*\(\s*k\s*===\s*'gateway'\s*\?\s*undefined\s*:\s*k\s*,\s*true\s*\)/,
		);
		expect(onboardingSource).toMatch(
			/\bimport\s*\(\s*'\.\.\/ModelPicker\/useModelCatalog'\s*\)/,
		);
		expect(onboardingSource).toContain("await refreshAllModelCatalogs();");
	});
});
