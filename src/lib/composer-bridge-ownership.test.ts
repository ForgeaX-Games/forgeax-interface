import { describe, expect, test } from "bun:test";

describe("composer bridge ownership", () => {
	test("accepts a product queue before application extensions start", async () => {
		const source = await Bun.file(
			new URL("./composer-bridge.ts", import.meta.url),
		).text();
		const startup = await Bun.file(
			new URL("../application.ts", import.meta.url),
		).text();
		expect(source).not.toContain("create<ComposerInsertBridge>");
		expect(startup).toContain(
			"configureComposerInsertRuntime(options.createComposerInsertRuntime)",
		);
		expect(
			startup.indexOf(
				"configureComposerInsertRuntime(options.createComposerInsertRuntime)",
			),
		).toBeLessThan(startup.indexOf("await bootstrapAppHost(overrides)"));
	});
	test("retains cross-product pills without owning Chat plain-text state", async () => {
		const source = await Bun.file(
			new URL("./composer-bridge.ts", import.meta.url),
		).text();

		expect(source).toContain("requestComposerInsert");
		expect(source).toContain("useComposerPendingInsert");
		expect(source).toContain("clearComposerPendingInsert");
		expect(source).not.toContain("ComposerTextRequest");
		expect(source).not.toContain("requestComposerText");
		expect(source).not.toContain("useComposerPendingText");
		expect(source).not.toContain("clearComposerPendingText");
		expect(source).not.toContain("advanceComposerTextRevision");
	});
});
