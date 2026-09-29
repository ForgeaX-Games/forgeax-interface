import {
	connectBroadcast,
	getBroadcastStatus as readStatus,
} from "@forgeax/app-shell/application";

export {
	disconnectBroadcast as disconnect,
	subscribeBroadcast,
} from "@forgeax/app-shell/application";

// Product endpoint policy stays here; App Shell owns the single realm transport.
function defaultUrl(): string {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${protocol}//${window.location.host}/ws`;
}

/** Preserve optional URL and sticky explicit URL behavior for existing boot callers. */
export function connect(url?: string): void {
	if (typeof window === "undefined") return;
	connectBroadcast(url || readStatus().url || defaultUrl());
}

/** Before boot, legacy callers still see the product endpoint rather than an empty URL. */
export function getBroadcastStatus(): { connected: boolean; url: string } {
	const status = readStatus();
	return {
		...status,
		url: status.url || (typeof window !== "undefined" ? defaultUrl() : ""),
	};
}
