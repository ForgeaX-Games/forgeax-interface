export interface UiActionBridgeEvent {
	readonly sid: string;
	readonly event: {
		readonly type: string;
		readonly payload: Record<string, unknown>;
	};
}

/** Presentation and domain adapters remain with their existing owners. */
export interface UiActionBridgeContext {
	getActiveSid(): string | null | undefined;
	subscribeActiveSid(listener: (sid: string | null | undefined) => void): void;
	subscribeSessionEvents(listener: (event: UiActionBridgeEvent) => void): void;
	installPresentation(): void;
	buildA11ySummary(): unknown;
	captureUiScreenshot(query: unknown): Promise<unknown>;
}

export type ApplicationUiActionBridgeBoot = (
	context: UiActionBridgeContext,
) => void;

/** This is a process owner, not a replaceable React effect or balanced observer. */
export function createUiActionBridgeBinding(
	fallback: ApplicationUiActionBridgeBoot,
) {
	let configured: ApplicationUiActionBridgeBoot | undefined;
	let started = false;
	return {
		configure(boot: ApplicationUiActionBridgeBoot | undefined): void {
			if (!boot || boot === configured) return;
			if (started || configured)
				throw new Error(
					"UI action bridge must be configured once before startup",
				);
			configured = boot;
		},
		boot(context: UiActionBridgeContext): void {
			if (started) return;
			started = true;
			(configured ?? fallback)(context);
		},
	};
}
