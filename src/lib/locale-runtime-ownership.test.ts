import { describe, expect, test } from "bun:test";
import {
	type ApplicationLocaleRuntime,
	createLocaleRuntimeBinding,
} from "../i18n/runtime";

function runtime() {
	let locale: "en" | "zh" = "en";
	const listeners = new Set<() => void>();
	let initCount = 0;
	const value: ApplicationLocaleRuntime = {
		init: () => {
			initCount++;
		},
		getLocale: () => locale,
		setLocale: (next) => {
			locale = next;
			for (const fn of listeners) fn();
		},
		subscribe: (fn) => {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		},
		t: (key) => `${locale}:${key}`,
	};
	return { value, listeners, initCount: () => initCount };
}

describe("product locale ownership", () => {
	test("one product authority serves early subscribers, reads and writes", () => {
		const fallback = runtime();
		const product = runtime();
		const binding = createLocaleRuntimeBinding(fallback.value, () => {});
		const observed: string[] = [];
		const stop = binding.subscribe(() => observed.push(binding.getLocale()));
		const factory = () => product.value;
		binding.configure(factory);
		binding.init();
		binding.configure(factory);
		binding.setLocale("zh");
		expect(binding.t("title")).toBe("zh:title");
		expect(product.initCount()).toBe(1);
		expect(fallback.initCount()).toBe(0);
		expect(fallback.listeners.size).toBe(0);
		expect(observed.at(-1)).toBe("zh");
		stop();
		const count = observed.length;
		product.value.setLocale("en");
		expect(observed.length).toBe(count);
		expect(() => binding.configure(() => runtime().value)).toThrow();
	});
	test("standalone remains authoritative when omitted; late replacement is rejected", () => {
		const fallback = runtime();
		const binding = createLocaleRuntimeBinding(fallback.value, () => {});
		binding.configure(undefined);
		binding.init();
		binding.setLocale("zh");
		expect(fallback.value.getLocale()).toBe("zh");
		expect(() => binding.configure(() => runtime().value)).toThrow();
	});
	test("failed and reentrant factories leave compatibility live and retryable", () => {
		const fallback = runtime();
		const binding = createLocaleRuntimeBinding(fallback.value, () => {});
		expect(() =>
			binding.configure(() => {
				throw new Error("setup");
			}),
		).toThrow("setup");
		expect(() =>
			binding.configure(() => {
				binding.configure(() => runtime().value);
				return runtime().value;
			}),
		).toThrow();
		const product = runtime();
		binding.configure(() => product.value);
		binding.setLocale("zh");
		expect(product.value.getLocale()).toBe("zh");
		expect(fallback.value.getLocale()).toBe("en");
	});
	test("failed subscription retained callbacks stay fenced", () => {
		const fallback = runtime();
		const binding = createLocaleRuntimeBinding(fallback.value, () => {});
		const product = runtime();
		let stale = () => {};
		let calls = 0;
		binding.subscribe(() => calls++);
		expect(() =>
			binding.configure(() => ({
				...product.value,
				subscribe: (fn) => {
					stale = fn;
					throw new Error("subscribe");
				},
			})),
		).toThrow("subscribe");
		stale();
		expect(calls).toBe(0);
		binding.setLocale("zh");
		expect(calls).toBe(1);
	});
});
