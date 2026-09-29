import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const STORAGE_KEY = "forgeax:auxbar-width";
const DEFAULT = 280;
const MIN = 200;
const MAX = 640;

// Bun caches the module across `it` blocks, so reload the public external store
// after each storage fixture change.
async function resetStore(): Promise<void> {
	const { auxBarWidthStore } = await import("./useAuxBarWidth");
	auxBarWidthStore.reload();
}

describe("useAuxBarWidth", () => {
	let registered = false;
	beforeEach(async () => {
		try {
			GlobalRegistrator.register();
			registered = true;
		} catch {
			registered = false;
		}
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* noop */
		}
	});
	afterEach(() => {
		if (registered) GlobalRegistrator.unregister();
	});

	it("default width is 280 when nothing is persisted", async () => {
		await resetStore();
		const { auxBarWidthStore } = await import("./useAuxBarWidth");
		expect(auxBarWidthStore.getSnapshot()).toBe(DEFAULT);
	});

	it("setWidth persists the value to localStorage", async () => {
		await resetStore();
		const { auxBarWidthStore } = await import("./useAuxBarWidth");
		auxBarWidthStore.setSize(320);
		expect(auxBarWidthStore.getSnapshot()).toBe(320);
		expect(localStorage.getItem(STORAGE_KEY)).toBe("320");
	});

	it("setWidth clamps below MIN", async () => {
		await resetStore();
		const { auxBarWidthStore } = await import("./useAuxBarWidth");
		auxBarWidthStore.setSize(50);
		expect(auxBarWidthStore.getSnapshot()).toBe(MIN);
		expect(localStorage.getItem(STORAGE_KEY)).toBe(String(MIN));
	});

	it("setWidth clamps above MAX", async () => {
		await resetStore();
		const { auxBarWidthStore } = await import("./useAuxBarWidth");
		auxBarWidthStore.setSize(2000);
		expect(auxBarWidthStore.getSnapshot()).toBe(MAX);
		expect(localStorage.getItem(STORAGE_KEY)).toBe(String(MAX));
	});

	it("tolerates malformed persisted values (NaN, missing) by falling back to default", async () => {
		localStorage.setItem(STORAGE_KEY, "not-a-number");
		await resetStore();
		const { auxBarWidthStore } = await import("./useAuxBarWidth");
		expect(auxBarWidthStore.getSnapshot()).toBe(DEFAULT);
	});
});
