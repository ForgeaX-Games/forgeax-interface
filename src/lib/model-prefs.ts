import { STORAGE_KEYS } from "./storageKeys";

// Per-provider "last hand-picked model" memory.
//
// Only an explicit model pick writes this preference. Both provider switching
// and new-session creation reuse it when the destination catalog still offers
// that model; automatic defaults must not overwrite the remembered choice.
//
// Keyed by catalog-provider id: a CLI driver id (claude-code / codex / …) or
// 'forgeax' for the native gateway path (catalogProviderId === null).

function storageKey(): string {
	return STORAGE_KEYS.lastModelByProvider;
}

function providerKey(catalogProviderId: string | null): string {
	return catalogProviderId && catalogProviderId !== "forgeax"
		? catalogProviderId
		: "forgeax";
}

function readMap(): Record<string, string> {
	try {
		const raw = localStorage.getItem(storageKey());
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, string>;
		}
		return {};
	} catch {
		return {};
	}
}

/** The model the user last hand-picked for this provider, or null if none. */
export function getLastModel(catalogProviderId: string | null): string | null {
	const v = readMap()[providerKey(catalogProviderId)];
	return typeof v === "string" && v.length > 0 ? v : null;
}
