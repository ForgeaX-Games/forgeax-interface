import type { PillPayload } from "./composer-bridge";

/** Product-owned, same-window FIFO. Snapshots must be stable until mutation. */
export interface ComposerInsertRuntime {
	getQueue(): readonly PillPayload[];
	subscribe(listener: () => void): () => void;
	request(payload: PillPayload): void;
	clear(): void;
}

/** Called once before extension setup. Adopt every pending reference in order.
 * Keep the factory identity stable across application recovery/restart. The
 * queue has page lifetime, not extension-runtime lifetime, just as before.
 */
export type ComposerInsertRuntimeFactory = (
	pending: readonly PillPayload[],
) => ComposerInsertRuntime;

function createCompatibilityQueue(): ComposerInsertRuntime {
	let queue: readonly PillPayload[] = [];
	const listeners = new Set<() => void>();
	const emit = () => {
		for (const listener of listeners) listener();
	};
	return {
		getQueue: () => queue,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		request: (payload) => {
			queue = [...queue, payload];
			emit();
		},
		clear: () => {
			queue = queue.slice(1);
			emit();
		},
	};
}

/** Compatibility callers and the injected product must never own two queues.
 * Unconfigured applications (including standalone) retain the original FIFO.
 */
export function createComposerInsertRuntimeBinding() {
	let active = createCompatibilityQueue();
	let configured: ComposerInsertRuntimeFactory | undefined;
	let configuring = false;
	const listeners = new Set<() => void>();
	const emit = () => {
		for (const listener of listeners) listener();
	};
	let unsubscribe = active.subscribe(emit);
	return {
		getQueue: () => active.getQueue(),
		getPending: () => active.getQueue()[0] ?? null,
		request: (payload: PillPayload) => active.request(payload),
		clear: () => active.clear(),
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		configure(factory: ComposerInsertRuntimeFactory | undefined): void {
			if (!factory || factory === configured) return;
			if (configured || configuring)
				throw new Error("Composer insert runtime is already configured");
			configuring = true;
			try {
				const previous = active;
				const pending = previous.getQueue();
				const next = factory(Object.freeze([...pending]));
				// Reject factories which drop/reorder early inserts, or mutate the old
				// queue reentrantly while taking ownership. Keep compatibility live.
				const validateHandoff = () => {
					const candidate = next.getQueue();
					if (
						previous.getQueue() !== pending ||
						pending.some((pill, index) => candidate[index] !== pill)
					) {
						throw new Error(
							"Composer insert runtime must preserve pending references",
						);
					}
				};
				validateHandoff();
				let installed = false;
				const nextUnsubscribe = next.subscribe(() => {
					if (installed) emit();
				});
				// Subscription is caller code too: it can write to either queue.
				// Recheck before retiring the only owner of pending references.
				try {
					validateHandoff();
				} catch (error) {
					try {
						nextUnsubscribe();
					} catch {
						/* inactive callbacks remain fenced */
					}
					throw error;
				}
				unsubscribe();
				active = next;
				unsubscribe = nextUnsubscribe;
				configured = factory;
				installed = true;
				emit();
			} finally {
				configuring = false;
			}
		},
	};
}
