import { describe, expect, it } from "bun:test";
import {
	loadModelCatalogWithBackup,
	recalledModelCatalog,
} from "./model-catalog-backup";

const down = async (): Promise<never> => {
	throw new Error("Unknown command: list_models");
};

describe("model catalog backup", () => {
	it("keeps the successful catalog on an HTTP failure and clears the notice on recovery", async () => {
		const provider = "backup-recovery";
		await loadModelCatalogWithBackup(provider, async () => ({
			models: [{ id: "luna" }],
		}));
		expect(await loadModelCatalogWithBackup(provider, down)).toEqual({
			models: [{ id: "luna" }],
			offline: true,
		});
		expect(
			await loadModelCatalogWithBackup(provider, async () => ({
				models: [{ id: "new-model" }],
			})),
		).toEqual({ models: [{ id: "new-model" }] });
	});
	it("never uses another provider catalog", async () => {
		await loadModelCatalogWithBackup("backup-native", async () => ({
			models: [{ id: "opus" }],
		}));
		expect(recalledModelCatalog("backup-codex")).toBeNull();
		await expect(
			loadModelCatalogWithBackup("backup-codex", down),
		).rejects.toThrow("Unknown command");
	});
	it("honors an authoritative empty catalog instead of resurrecting removed models", async () => {
		await loadModelCatalogWithBackup("backup-empty", async () => ({
			models: [{ id: "removed" }],
		}));
		await loadModelCatalogWithBackup("backup-empty", async () => ({
			models: [],
		}));
		expect(recalledModelCatalog("backup-empty")).toBeNull();
	});
	it("restores a provider catalog from persistent browser storage", () => {
		const previous = Object.getOwnPropertyDescriptor(
			globalThis,
			"localStorage",
		);
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) =>
					key.endsWith("backup-reload")
						? JSON.stringify({ models: [{ id: "saved" }] })
						: "{bad",
			},
		});
		try {
			expect(recalledModelCatalog("backup-reload")).toEqual({
				models: [{ id: "saved" }],
				offline: true,
			});
			expect(recalledModelCatalog("backup-corrupt")).toBeNull();
		} finally {
			if (previous) Object.defineProperty(globalThis, "localStorage", previous);
			else Reflect.deleteProperty(globalThis, "localStorage");
		}
	});
});
