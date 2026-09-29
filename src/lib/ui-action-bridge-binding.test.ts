import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createUiActionBridgeBinding } from "./ui-action-bridge-binding";

describe("page-lifetime UI action bridge binding", () => {
	test("boots only the chosen product with the original presentation context", () => {
		const calls: string[] = [];
		const context = {} as Parameters<
			Parameters<typeof createUiActionBridgeBinding>[0]
		>[0];
		const binding = createUiActionBridgeBinding(() => calls.push("fallback"));
		const product = (actual: typeof context) => {
			expect(actual).toBe(context);
			calls.push("product");
			binding.boot(context);
		};
		binding.configure(product);
		binding.configure(product);
		binding.boot(context);
		binding.boot(context);
		binding.configure(product);
		expect(calls).toEqual(["product"]);
		expect(() => binding.configure(() => {})).toThrow();
	});

	test("keeps standalone fallback and forbids replacement after it starts", () => {
		let boots = 0;
		const binding = createUiActionBridgeBinding(() => boots++);
		binding.configure(undefined);
		binding.boot({} as never);
		binding.boot({} as never);
		expect(boots).toBe(1);
		expect(() => binding.configure(() => {})).toThrow();
	});

	test("does not start a second process owner after partial startup throws", () => {
		let boots = 0;
		const binding = createUiActionBridgeBinding(() => {
			boots++;
			throw new Error("partial startup");
		});
		expect(() => binding.boot({} as never)).toThrow("partial startup");
		binding.boot({} as never);
		expect(boots).toBe(1);
		expect(() => binding.configure(() => {})).toThrow();
	});

	test("public entry exposes binding without restoring registry exports", () => {
		const entry = readFileSync(
			new URL("../application.ts", import.meta.url),
			"utf8",
		);
		expect(entry).toContain("configureApplicationUiActionBridge");
		expect(entry).toContain("bootApplicationUiActionBridge");
		const bridge = readFileSync(
			new URL("./ui-bridge.ts", import.meta.url),
			"utf8",
		);
		expect(bridge).not.toContain("/ui-lease");
		expect(bridge).not.toContain("perception-reply");
		expect(bridge).toContain("binding.boot(");
	});
});
