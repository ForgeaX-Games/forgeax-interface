/** DEV-only Studio shell boot breadcrumbs — filter console with `[studio-boot-trace]`. */

const snapshot: Record<string, unknown> = { phase: "init" };
const stages: string[] = [];

function studioBootTraceEnabled(): boolean {
	if (!import.meta.env.DEV) return false;
	const raw =
		(typeof import.meta.env.FORGEAX_STUDIO_BOOT_TRACE === "string"
			? import.meta.env.FORGEAX_STUDIO_BOOT_TRACE
			: undefined) ??
		(typeof globalThis !== "undefined"
			? (globalThis as Record<string, unknown>).FORGEAX_STUDIO_BOOT_TRACE
			: undefined);
	return typeof raw === "string" && /^(1|true|yes|on)$/i.test(raw.trim());
}

export function studioBootTrace(
	stage: string,
	detail: Record<string, unknown> = {},
): void {
	if (!studioBootTraceEnabled()) return;
	Object.assign(snapshot, { stage, ...detail, at: new Date().toISOString() });
	stages.push(stage);
	console.info(`[studio-boot-trace] ${stage} ${JSON.stringify(detail)}`);
}

export function installStudioBootTraceProbe(): void {
	if (!studioBootTraceEnabled()) return;
	Object.defineProperty(window, "__forgeaxStudioBootTrace", {
		configurable: true,
		enumerable: false,
		value: () => ({ snapshot: { ...snapshot }, stages: [...stages] }),
	});
}
