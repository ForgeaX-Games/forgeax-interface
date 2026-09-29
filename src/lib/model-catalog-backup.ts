import type { ModelCatalogWithMeta } from "./model-config";

const prefix = "forgeax:model-catalog:v1:";
const memory = new Map<string, ModelCatalogWithMeta>();
const keyFor = (provider?: string | null) =>
	prefix + (provider?.trim() || "gateway");

/** Browser-origin and provider scoped. Store successful catalogs, never errors or credentials. */
export function rememberModelCatalog(
	provider: string | null | undefined,
	payload: ModelCatalogWithMeta,
): void {
	const key = keyFor(provider);
	memory.set(key, payload);
	try {
		localStorage.setItem(key, JSON.stringify(payload));
	} catch {
		/* Memory cache still works. */
	}
}

export function recalledModelCatalog(
	provider?: string | null,
): ModelCatalogWithMeta | null {
	const key = keyFor(provider);
	let value: ModelCatalogWithMeta | undefined = memory.get(key);
	if (!value) {
		try {
			const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
			if (
				parsed &&
				Array.isArray(parsed.models) &&
				parsed.models.every(
					(m: unknown) =>
						m !== null &&
						typeof m === "object" &&
						typeof (m as { id?: unknown }).id === "string",
				)
			)
				value = parsed;
		} catch {
			/* Missing, corrupt, or unavailable storage is not a catalog. */
		}
	}
	return value && value.models.length > 0 ? { ...value, offline: true } : null;
}

export async function loadModelCatalogWithBackup(
	provider: string | null | undefined,
	request: () => Promise<ModelCatalogWithMeta>,
): Promise<ModelCatalogWithMeta> {
	try {
		const payload = await request();
		// An authoritative empty response invalidates the old catalog too.
		rememberModelCatalog(provider, payload);
		return payload;
	} catch (error) {
		const backup = recalledModelCatalog(provider);
		if (backup) return backup;
		throw error;
	}
}
