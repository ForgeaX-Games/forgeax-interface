import "../../lib/telemetry-test-prelude";
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createAppHost, HostProvider } from "../../core/app-shell";
import {
	PASSIVE_FEEDBACK_EVENT,
	type PassiveFeedbackSignal,
} from "../../lib/passive-feedback";
import { useHealthStore } from "../StatusBar/healthStore";
import { PassiveFeedbackHost } from "./PassiveFeedback";

const restorers: (() => void)[] = [];
afterEach(() => {
	try {
		cleanup();
	} finally {
		for (const restore of restorers.splice(0).reverse()) restore();
		sessionStorage.removeItem("forgeax.feedback.passive.seen");
	}
});

function fixture() {
	let now = 100;
	let failClear = false;
	const intervals: {
		callback: () => void;
		handle: number;
		cleared: boolean;
	}[] = [];
	const originalSet = window.setInterval.bind(window);
	const originalClear = window.clearInterval.bind(window);
	const set = spyOn(window, "setInterval").mockImplementation(((
		callback: () => void,
		delay?: number,
		...args: unknown[]
	) => {
		if (delay !== 1000) return originalSet(callback, delay, ...args);
		const handle = 950_000 + intervals.length;
		intervals.push({ callback, handle, cleared: false });
		return handle;
	}) as typeof window.setInterval);
	const clear = spyOn(window, "clearInterval").mockImplementation((handle) => {
		const interval = intervals.find(
			(candidate) => candidate.handle === Number(handle),
		);
		if (!interval) {
			originalClear(handle);
			return;
		}
		interval.cleared = true;
		if (failClear) throw new Error("native interval cleanup failed");
	});
	const clock = spyOn(performance, "now").mockImplementation(() => now);
	const subscriptions = new Set<() => void>();
	const originalSubscribe = useHealthStore.subscribe;
	const subscribe = spyOn(useHealthStore, "subscribe").mockImplementation(
		(listener) => {
			const unsubscribe = originalSubscribe(listener);
			const dispose = () => {
				subscriptions.delete(dispose);
				unsubscribe();
			};
			subscriptions.add(dispose);
			return dispose;
		},
	);
	const signals: PassiveFeedbackSignal[] = [];
	const receive = (event: Event) =>
		signals.push((event as CustomEvent<PassiveFeedbackSignal>).detail);
	window.addEventListener(PASSIVE_FEEDBACK_EVENT, receive);
	restorers.push(() => {
		failClear = false;
		for (const dispose of subscriptions) dispose();
		window.removeEventListener(PASSIVE_FEEDBACK_EVENT, receive);
		subscribe.mockRestore();
		clock.mockRestore();
		clear.mockRestore();
		set.mockRestore();
	});
	sessionStorage.removeItem("forgeax.feedback.passive.seen");
	useHealthStore.setState({ entries: [] });
	const { host } = createAppHost();
	const view = render(
		<HostProvider value={host}>
			<PassiveFeedbackHost />
		</HostProvider>,
		{ reactStrictMode: true },
	);
	return {
		intervals,
		signals,
		subscriptions,
		view,
		setNow: (value: number) => {
			now = value;
		},
		failCleanup: () => {
			failClear = true;
		},
	};
}

describe("passive feedback lag interval with the real component", () => {
	it("keeps cadence, threshold, expected-time reset, rounding and session-once corner UI", () => {
		const { intervals, signals, view, setNow } = fixture();
		expect(intervals).toHaveLength(2);
		expect(intervals.map((interval) => interval.cleared)).toEqual([
			true,
			false,
		]);
		expect(signals).toHaveLength(0);
		setNow(1100);
		act(() => intervals[1]!.callback());
		setNow(7099);
		act(() => intervals[1]!.callback());
		expect(signals).toHaveLength(0);
		setNow(13099);
		act(() => intervals[1]!.callback());
		expect(signals).toEqual([
			{
				code: "main-thread-stall",
				durationMs: 5_000,
				message: "Main thread was unresponsive for 5 seconds",
			},
		]);
		expect(view.getAllByRole("alert")).toHaveLength(1);
		expect(
			view.container.querySelector(".feedback-passive-card--corner"),
		).toBeTruthy();
		setNow(20199);
		act(() => intervals[1]!.callback());
		expect(signals[1]?.message).toBe(
			"Main thread was unresponsive for 6 seconds",
		);
		expect(signals[1]?.durationMs).toBe(6_100);
		expect(view.getAllByRole("alert")).toHaveLength(1);
		expect(
			JSON.parse(sessionStorage.getItem("forgeax.feedback.passive.seen")!),
		).toEqual(["main-thread-stall"]);
	});

	it("fences the discarded StrictMode callback before it reports a stale stall", () => {
		const { intervals, signals, view, setNow } = fixture();
		setNow(6100);
		act(() => intervals[0]!.callback());
		expect(signals).toHaveLength(0);
		expect(view.queryByRole("alert")).toBeNull();
		expect(sessionStorage.getItem("forgeax.feedback.passive.seen")).toBeNull();
		act(() => intervals[1]!.callback());
		expect(signals).toHaveLength(1);
	});

	it("clears intervals and health subscriptions and fences retained callbacks after unmount", () => {
		const { intervals, signals, subscriptions, view, setNow } = fixture();
		expect(subscriptions.size).toBe(1);
		view.unmount();
		expect(subscriptions.size).toBe(0);
		expect(intervals.every((interval) => interval.cleared)).toBe(true);
		setNow(6100);
		act(() => {
			for (const interval of intervals) interval.callback();
		});
		expect(signals).toHaveLength(0);
	});

	it("isolates native clear failure so the adjacent health subscription still disposes", () => {
		const { intervals, signals, subscriptions, view, setNow, failCleanup } =
			fixture();
		failCleanup();
		expect(() => view.unmount()).not.toThrow();
		expect(subscriptions.size).toBe(0);
		setNow(6100);
		act(() => {
			for (const interval of intervals) interval.callback();
		});
		expect(signals).toHaveLength(0);
	});

	it("isolates a failed signal callback while later interval ticks still report", () => {
		const { intervals, signals, setNow } = fixture();
		const originalDispatch = window.dispatchEvent.bind(window);
		let fail = true;
		const dispatch = spyOn(window, "dispatchEvent").mockImplementation(
			(event) => {
				if (event.type === PASSIVE_FEEDBACK_EVENT && fail) {
					fail = false;
					throw new Error("signal dispatch failed");
				}
				return originalDispatch(event);
			},
		);
		restorers.push(() => dispatch.mockRestore());
		setNow(6100);
		expect(() => act(() => intervals[1]!.callback())).not.toThrow();
		setNow(12100);
		act(() => intervals[1]!.callback());
		expect(signals).toHaveLength(1);
	});
});
