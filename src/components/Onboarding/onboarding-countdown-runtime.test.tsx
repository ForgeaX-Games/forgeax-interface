import "../../lib/telemetry-test-prelude";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createAppHost, HostProvider } from "../../core/app-shell";
import { t } from "../../i18n";
import { APP_EVENTS, STORAGE_KEYS } from "../../lib/storageKeys";
import { useShellStore } from "../../store";
import * as clients from "../../store-parts/domain-clients";
import { OnboardingController } from "./OnboardingController";
import { loadOnboarding, saveOnboarding } from "./types";

const restorers: (() => void)[] = [];
afterEach(() => {
	try {
		cleanup();
	} finally {
		for (const restore of restorers.splice(0).reverse()) restore();
	}
});

async function fixture() {
	let failClear = false;
	let failRegister = false;
	const intervals: { callback: () => void; handle: number; clears: number }[] =
		[];
	const originalSet = globalThis.setInterval.bind(globalThis);
	const originalClear = globalThis.clearInterval.bind(globalThis);
	const set = spyOn(globalThis, "setInterval").mockImplementation(((
		callback: () => void,
		delay?: number,
		...args: unknown[]
	) => {
		if (delay !== 1000) return originalSet(callback, delay, ...args);
		const handle = 960_000 + intervals.length;
		intervals.push({ callback, handle, clears: 0 });
		if (failRegister)
			throw new Error("interval retained callback then registration failed");
		return handle;
	}) as typeof setInterval);
	const clear = spyOn(globalThis, "clearInterval").mockImplementation(
		(handle) => {
			const interval = intervals.find(
				(candidate) => candidate.handle === Number(handle),
			);
			if (!interval) {
				originalClear(handle);
				return;
			}
			interval.clears++;
			if (failClear) throw new Error("native interval cleanup failed");
		},
	);
	const requests: string[] = [];
	const network = spyOn(globalThis, "fetch").mockImplementation(
		async (input, init) => {
			const url = String(input);
			requests.push(url);
			if (
				url !== "/api/cli/health" ||
				(init?.method && init.method !== "GET")
			) {
				throw new Error(`Unexpected onboarding request: ${url}`);
			}
			return Response.json({ providers: [{ id: "claude-code", ok: true }] });
		},
	);
	// Only service boundaries are replaced; the component, route selection and
	// published interval lifecycle are real. No settings/model writes are sent.
	const projects = spyOn(clients, "getStudioProjectClient").mockReturnValue({
		listProjects: async () => ({ games: [], activeSlug: null }),
	} as clients.StudioProjectClient);
	const originalRoute = useShellStore.getState().setProviderOverride;
	const route = mock(() => {});
	useShellStore.setState({ setProviderOverride: route });
	const persisted = localStorage.getItem(STORAGE_KEYS.onboarding);
	saveOnboarding({
		v: 2,
		phase: "welcome",
		done: { tour: false, firstChat: false },
	});
	const phases: string[] = [];
	const onPhase = () => phases.push(loadOnboarding().phase);
	window.addEventListener(APP_EVENTS.onboardingChanged, onPhase);
	restorers.push(() => {
		window.removeEventListener(APP_EVENTS.onboardingChanged, onPhase);
		if (persisted === null) localStorage.removeItem(STORAGE_KEYS.onboarding);
		else localStorage.setItem(STORAGE_KEYS.onboarding, persisted);
		useShellStore.setState({ setProviderOverride: originalRoute });
		projects.mockRestore();
		network.mockRestore();
		clear.mockRestore();
		set.mockRestore();
	});
	const { host } = createAppHost();
	const view = render(
		<HostProvider value={host}>
			<OnboardingController />
		</HostProvider>,
		{ reactStrictMode: true },
	);
	await act(async () => {});
	const start = async () => {
		fireEvent.click(
			view.getByRole("button", { name: t("onboarding.connect.cliTitle") }),
		);
		await act(async () => {
			fireEvent.click(view.getByRole("button", { name: t("onboarding.next") }));
		});
	};
	const expectCount = (n: number) =>
		expect(
			view.getByRole("button", { name: t("onboarding.nextCountdown", { n }) }),
		).toBeTruthy();
	return {
		intervals,
		requests,
		route,
		phases,
		view,
		start,
		expectCount,
		failCleanup: () => {
			failClear = true;
		},
		failRegistration: () => {
			failRegister = true;
		},
	};
}

describe("onboarding countdown with the real component and published interval lifecycle", () => {
	it("keeps the deferred 1000ms ticks, 2-to-1 progression and project completion", async () => {
		const f = await fixture();
		expect(f.intervals).toHaveLength(0);
		await f.start();
		expect(f.intervals).toHaveLength(1);
		expect(f.route.mock.calls).toEqual([["claude-code"]]);
		expect(f.requests.every((url) => url === "/api/cli/health")).toBe(true);
		f.expectCount(2);
		act(() => f.intervals[0]!.callback());
		f.expectCount(1);
		expect(f.phases).toEqual([]);
		act(() => f.intervals[0]!.callback());
		expect(loadOnboarding().phase).toBe("project");
		// This updater already has side effects: StrictMode replays its phase
		// notification. Timer ownership deliberately does not change that policy.
		expect(f.phases).toEqual(["project", "project"]);
		expect(f.intervals[0]!.clears).toBe(1);
		act(() => f.intervals[0]!.callback());
		expect(f.phases).toEqual(["project", "project"]);
	});

	it("resets on selection and uses a fresh timer without letting the old callback decrement it", async () => {
		const f = await fixture();
		await f.start();
		fireEvent.click(
			f.view.getByRole("button", { name: t("onboarding.connect.keyTitle") }),
		);
		expect(f.intervals[0]!.clears).toBe(1);
		expect(
			f.view.getByRole("button", { name: t("onboarding.next") }),
		).toBeTruthy();
		await f.start();
		expect(f.intervals).toHaveLength(2);
		f.expectCount(2);
		act(() => f.intervals[0]!.callback());
		f.expectCount(2);
		act(() => f.intervals[1]!.callback());
		f.expectCount(1);
		expect(f.intervals[1]!.clears).toBe(0);
	});

	for (const action of ["skip", "next"] as const) {
		it(`cleans up on ${action} and still advances when native cleanup throws`, async () => {
			const f = await fixture();
			await f.start();
			f.failCleanup();
			const name =
				action === "skip"
					? t("onboarding.skip")
					: t("onboarding.nextCountdown", { n: 2 });
			fireEvent.click(f.view.getByRole("button", { name }));
			expect(loadOnboarding().phase).toBe("project");
			expect(f.phases).toEqual(["project"]);
			expect(f.intervals[0]!.clears).toBe(1);
			act(() => f.intervals[0]!.callback());
			f.view.unmount();
			expect(f.intervals[0]!.clears).toBe(1);
			expect(f.phases).toEqual(["project"]);
		});
	}

	it("disposes on unmount despite a native cleanup failure", async () => {
		const f = await fixture();
		await f.start();
		f.failCleanup();
		expect(() => f.view.unmount()).not.toThrow();
		expect(f.intervals[0]!.clears).toBe(1);
		act(() => f.intervals[0]!.callback());
		expect(f.phases).toEqual([]);
		expect(loadOnboarding().phase).toBe("welcome");
	});

	it("isolates register-then-throw and fences its retained callback without inventing a handle", async () => {
		const f = await fixture();
		f.failRegistration();
		await f.start();
		f.expectCount(2);
		expect(f.view.container.querySelector(".fx-ob-callout.ok")).toBeTruthy();
		expect(f.view.container.querySelector(".fx-ob-callout.err")).toBeNull();
		act(() => f.intervals[0]!.callback());
		f.expectCount(2);
		f.view.unmount();
		expect(f.intervals[0]!.clears).toBe(0);
	});
});
