import { type StoreApi, type UseBoundStore, useStore } from "zustand";
import type { AppState } from "../store-contract";

export type ApplicationShellStore = UseBoundStore<StoreApi<AppState>>;
export type ApplicationShellStoreFactory = () => ApplicationShellStore;

/** A page chooses one authority. There is no fallback-to-product state handoff:
 * subscribers, captured actions and in-flight requests must never change owners. */
export function createShellStoreBinding(
	fallback: ApplicationShellStoreFactory,
) {
	let configured: ApplicationShellStoreFactory | undefined;
	let phase: "idle" | "constructing" | "ready" | "failed" = "idle";
	let authority: ApplicationShellStore;
	let failure: unknown;
	const getAuthority = (): ApplicationShellStore => {
		if (phase === "ready") return authority;
		if (phase === "failed") throw failure;
		if (phase === "constructing")
			throw new Error("Shell store construction cannot reenter its binding");
		phase = "constructing";
		try {
			authority = (configured ?? fallback)();
			if (authority === store)
				throw new Error(
					"Shell store construction must return its own authority",
				);
			phase = "ready";
			return authority;
		} catch (error) {
			failure = error;
			phase = "failed";
			throw error;
		}
	};
	const store = Object.assign(
		function useShellStore<T = AppState>(
			selector: (state: AppState) => T = (state) => state as T,
		): T {
			return useStore(getAuthority(), selector);
		},
		{
			getState: () => getAuthority().getState(),
			getInitialState: () => getAuthority().getInitialState(),
			subscribe: ((listener) =>
				getAuthority().subscribe(listener)) as StoreApi<AppState>["subscribe"],
			setState: ((...args: Parameters<StoreApi<AppState>["setState"]>) =>
				getAuthority().setState(...args)) as StoreApi<AppState>["setState"],
		},
	) as ApplicationShellStore;
	return {
		store,
		configure(factory: ApplicationShellStoreFactory | undefined): void {
			if (!factory || factory === configured) return;
			if (phase !== "idle" || configured)
				throw new Error(
					"Shell store must be configured once before its first use",
				);
			configured = factory;
		},
	};
}
