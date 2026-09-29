import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { create } from "zustand";
import type { AppState } from "../store";
import { createShellStoreBinding } from "./runtime-binding";

const makeStore = () =>
	create<AppState>(() => ({ activeSid: "initial" }) as AppState);

describe("one page-lifetime shell state authority", () => {
	test("does not instantiate compatibility state when a product is selected", () => {
		let fallbackCalls = 0;
		const product = makeStore();
		const binding = createShellStoreBinding(() => {
			fallbackCalls++;
			return makeStore();
		});
		const factory = () => product;
		const capturedRead = binding.store.getState;
		const capturedSubscribe = binding.store.subscribe;
		binding.configure(factory);
		binding.configure(factory);
		const seen: string[] = [];
		const stop = capturedSubscribe((state) => seen.push(state.activeSid!));
		product.setState({ activeSid: "product" });
		expect(capturedRead()).toBe(product.getState());
		expect(binding.store.getInitialState()).toBe(product.getInitialState());
		binding.store.setState({ activeSid: "compatibility" });
		expect(product.getState().activeSid).toBe("compatibility");
		expect(seen).toEqual(["product", "compatibility"]);
		stop();
		product.setState({ activeSid: "unsubscribed" });
		expect(seen).toHaveLength(2);
		expect(fallbackCalls).toBe(0);
		expect(() => binding.configure(() => makeStore())).toThrow();
	});

	test("preserves standalone fallback identity and refuses a late second store", () => {
		let calls = 0;
		const fallback = makeStore();
		const binding = createShellStoreBinding(() => {
			calls++;
			return fallback;
		});
		expect(calls).toBe(0);
		binding.configure(undefined);
		expect(binding.store.getState()).toBe(fallback.getState());
		expect(binding.store.getState()).toBe(fallback.getState());
		expect(calls).toBe(1);
		expect(() => binding.configure(makeStore)).toThrow();
	});

	test("failed or reentrant construction never installs a second owner", () => {
		let calls = 0;
		const failure = new Error("partial setup");
		const binding = createShellStoreBinding(() => {
			calls++;
			throw failure;
		});
		expect(() => binding.store.getState()).toThrow(failure);
		expect(() => binding.store.subscribe(() => {})).toThrow(failure);
		expect(calls).toBe(1);
		expect(() => binding.configure(makeStore)).toThrow();
		const reentrant = createShellStoreBinding(() => {
			reentrant.store.getState();
			return makeStore();
		});
		expect(() => reentrant.store.getState()).toThrow("construction");
		expect(() => reentrant.store.getState()).toThrow("construction");
	});

	test("public entry binds authority and store facade creates no process state", () => {
		const facade = readFileSync(
			new URL("../store.ts", import.meta.url),
			"utf8",
		);
		const entry = readFileSync(
			new URL("../application.ts", import.meta.url),
			"utf8",
		);
		expect(entry).toContain("configureApplicationShellStore");
		expect(facade).toContain("binding.store");
		expect(facade).not.toContain("create<AppState>");
		expect(facade).not.toContain("installStorageObservation");
		expect(facade).not.toContain("cleanupLegacySessionKeys()");
	});
});
