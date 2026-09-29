export type Locale = "en" | "zh";
export type TFunction = (
	key: string,
	vars?: Record<string, string | number>,
) => string;

/** One page-lifetime product authority; Interface only adapts existing consumers. */
export interface ApplicationLocaleRuntime {
	init(): void;
	getLocale(): Locale;
	setLocale(next: Locale, options?: { persist?: boolean }): void;
	subscribe(listener: () => void): () => void;
	t: TFunction;
}

/** Browser preference transport remains the existing composition owner. */
export type ApplicationLocaleRuntimeFactory = (context: {
	readonly flushBrowserPrefs: () => void;
}) => ApplicationLocaleRuntime;

export function createLocaleRuntimeBinding(
	fallback: ApplicationLocaleRuntime,
	flushBrowserPrefs: () => void,
) {
	let active = fallback;
	let configured: ApplicationLocaleRuntimeFactory | undefined;
	let configuring = false;
	let started = false;
	const listeners = new Set<() => void>();
	const emit = () => {
		for (const listener of listeners) listener();
	};
	let unsubscribe = fallback.subscribe(emit);
	return {
		init: () => {
			started = true;
			active.init();
		},
		getLocale: () => active.getLocale(),
		setLocale: (next: Locale, options?: { persist?: boolean }) => {
			// A started standalone owns browser listeners. Never leave two owners live.
			started = true;
			active.setLocale(next, options);
		},
		t: ((key, vars) => active.t(key, vars)) as TFunction,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		configure(factory: ApplicationLocaleRuntimeFactory | undefined): void {
			if (!factory || factory === configured) return;
			if (configured || configuring || started)
				throw new Error(
					"Locale runtime must be configured once before initialization",
				);
			configuring = true;
			let installed = false;
			let nextUnsubscribe: (() => void) | undefined;
			try {
				const next = factory({ flushBrowserPrefs });
				if (started)
					throw new Error("Locale runtime initialized during configuration");
				nextUnsubscribe = next.subscribe(() => {
					if (installed) emit();
				});
				if (started)
					throw new Error("Locale runtime initialized during subscription");
				unsubscribe();
				active = next;
				unsubscribe = nextUnsubscribe;
				configured = factory;
				installed = true;
			} catch (error) {
				try {
					nextUnsubscribe?.();
				} catch {
					/* Uninstalled callbacks stay fenced. */
				}
				throw error;
			} finally {
				configuring = false;
			}
			emit();
		},
	};
}
