import { describe, expect, test } from "bun:test";
import type { PillPayload } from "./composer-bridge";
import {
	type ComposerInsertRuntime,
	createComposerInsertRuntimeBinding,
} from "./composer-insert-runtime";

const pill = (display: string): PillPayload => ({
	kind: "file",
	display,
	detail: display,
	tooltip: { title: display, lines: [] },
});

function productQueue(seed: readonly PillPayload[]) {
	let queue = [...seed];
	const listeners = new Set<() => void>();
	const emit = () => {
		for (const listener of listeners) listener();
	};
	const runtime: ComposerInsertRuntime = {
		getQueue: () => queue,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		request(payload) {
			queue = [...queue, payload];
			emit();
		},
		clear() {
			queue = queue.slice(1);
			emit();
		},
	};
	return runtime;
}

describe("product composer queue binding", () => {
	test("failed installation callbacks stay fenced when retry adopts the same runtime", () => {
		const binding = createComposerInsertRuntimeBinding();
		const candidate = productQueue([]);
		let fail = true;
		let stale = () => {};
		const subscribe = candidate.subscribe;
		candidate.subscribe = (listener) => {
			if (fail) {
				stale = listener;
				throw new Error("registration failed");
			}
			return subscribe(listener);
		};
		const factory = () => candidate;
		let changes = 0;
		binding.subscribe(() => changes++);
		expect(() => binding.configure(factory)).toThrow("registration failed");
		fail = false;
		binding.configure(factory);
		expect(changes).toBe(1);
		stale();
		expect(changes).toBe(1);
		candidate.request(pill("live"));
		expect(changes).toBe(2);
	});
	test("subscription-time writes preserve the old queue and dispose the rejected candidate", () => {
		const binding = createComposerInsertRuntimeBinding();
		const a = pill("a"),
			b = pill("b");
		binding.request(a);
		let stopped = 0;
		let retained = () => {};
		let changes = 0;
		binding.subscribe(() => changes++);
		expect(() =>
			binding.configure((seed) => ({
				...productQueue(seed),
				subscribe(listener) {
					retained = listener;
					binding.request(b);
					return () => {
						stopped++;
						throw new Error("cleanup failed");
					};
				},
			})),
		).toThrow("preserve pending references");
		expect(stopped).toBe(1);
		expect(binding.getQueue()).toEqual([a, b]);
		retained();
		expect(changes).toBe(1);
		binding.configure(productQueue);
		expect(binding.getQueue()).toEqual([a, b]);
		retained();
		expect(changes).toBe(2);
	});

	test("subscription-time removal of a seed rejects the candidate", () => {
		const binding = createComposerInsertRuntimeBinding();
		const a = pill("a");
		binding.request(a);
		let stopped = 0;
		expect(() =>
			binding.configure((seed) => {
				const candidate = productQueue(seed);
				return {
					...candidate,
					subscribe() {
						candidate.clear();
						return () => {
							stopped++;
						};
					},
				};
			}),
		).toThrow("preserve pending references");
		expect(stopped).toBe(1);
		expect(binding.getQueue()).toEqual([a]);
		binding.configure(productQueue);
		expect(binding.getPending()).toBe(a);
	});
	test("standalone fallback retains FIFO identity and subscription cleanup", () => {
		const binding = createComposerInsertRuntimeBinding();
		const a = pill("a"),
			b = pill("b");
		let changes = 0;
		const stop = binding.subscribe(() => changes++);
		binding.configure(undefined);
		expect(binding.getPending()).toBeNull();
		binding.request(a);
		binding.request(b);
		expect(binding.getPending()).toBe(a);
		const snapshot = binding.getQueue();
		expect(binding.getQueue()).toBe(snapshot);
		binding.clear();
		expect(binding.getPending()).toBe(b);
		binding.clear();
		binding.clear();
		expect(binding.getPending()).toBeNull();
		expect(changes).toBe(5);
		stop();
		binding.request(a);
		expect(changes).toBe(5);
	});

	test("adopts pre-mount batches once and routes both writers to one product queue", () => {
		const binding = createComposerInsertRuntimeBinding();
		const a = pill("a"),
			b = pill("b"),
			c = pill("c"),
			d = pill("d");
		binding.request(a);
		binding.request(b);
		let calls = 0;
		let product!: ComposerInsertRuntime;
		const factory = (seed: readonly PillPayload[]) => {
			calls++;
			expect(Object.isFrozen(seed)).toBe(true);
			product = productQueue(seed);
			return product;
		};
		let changes = 0;
		const stop = binding.subscribe(() => changes++);
		binding.configure(factory);
		expect(changes).toBe(1);
		binding.configure(factory); // StrictMode / recovery must not seed twice.
		binding.configure(undefined); // Compatibility startup cannot reset ownership.
		expect(calls).toBe(1);
		binding.request(c);
		product.request(d);
		expect(binding.getQueue()).toBe(product.getQueue());
		expect(binding.getQueue()).toEqual([a, b, c, d]);
		product.clear();
		expect(binding.getPending()).toBe(b);
		binding.clear();
		expect(product.getQueue()).toEqual([c, d]);
		expect(changes).toBe(5);
		stop();
		product.clear();
		expect(changes).toBe(5);
	});

	test("rejects a second owner without resetting pending work", () => {
		const binding = createComposerInsertRuntimeBinding();
		binding.configure(productQueue);
		const a = pill("a");
		binding.request(a);
		expect(() => binding.configure((seed) => productQueue(seed))).toThrow(
			"already configured",
		);
		expect(binding.getPending()).toBe(a);
	});

	test("factory failure or dropped seed leaves compatibility requests available", () => {
		const binding = createComposerInsertRuntimeBinding();
		const a = pill("a");
		binding.request(a);
		expect(() =>
			binding.configure(() => {
				throw new Error("factory failed");
			}),
		).toThrow("factory failed");
		expect(() => binding.configure(() => productQueue([]))).toThrow(
			"preserve pending references",
		);
		expect(binding.getPending()).toBe(a);
		binding.configure(productQueue);
		expect(binding.getQueue()).toEqual([a]);
	});

	test("rejects reentrant handoff writes without losing them", () => {
		const binding = createComposerInsertRuntimeBinding();
		const a = pill("a"),
			b = pill("b");
		binding.request(a);
		expect(() =>
			binding.configure((seed) => {
				binding.request(b);
				return productQueue(seed);
			}),
		).toThrow("preserve pending references");
		expect(binding.getQueue()).toEqual([a, b]);
		binding.configure(productQueue);
		expect(binding.getQueue()).toEqual([a, b]);
	});

	test("failed subscription cannot activate a retained candidate callback", () => {
		const binding = createComposerInsertRuntimeBinding();
		let retained: () => void = () => {};
		let changes = 0;
		binding.subscribe(() => changes++);
		expect(() =>
			binding.configure((seed) => ({
				...productQueue(seed),
				subscribe(listener) {
					retained = listener;
					throw new Error("subscribe failed");
				},
			})),
		).toThrow("subscribe failed");
		retained();
		expect(changes).toBe(0);
		binding.request(pill("a"));
		expect(changes).toBe(1);
		binding.configure(productQueue);
		retained();
		expect(changes).toBe(2);
	});
});
