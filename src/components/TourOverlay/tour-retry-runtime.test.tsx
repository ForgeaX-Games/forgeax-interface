import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { TourOverlay, type TourOverlayProps } from "./TourOverlay";

const restorers: (() => void)[] = [];
afterEach(() => {
	cleanup();
	for (const restore of restorers.splice(0).reverse()) restore();
});

function trapRetries() {
	const entries: {
		callback: () => void;
		handle: number;
		cancelled: boolean;
	}[] = [];
	const originalSet = globalThis.setTimeout;
	const originalClear = globalThis.clearTimeout;
	const set = spyOn(globalThis, "setTimeout").mockImplementation(((
		callback: () => void,
		delay?: number,
		...args: unknown[]
	) => {
		if (delay !== 60) return originalSet(callback, delay, ...args);
		const handle = 920_000 + entries.length;
		entries.push({ callback, handle, cancelled: false });
		return handle;
	}) as typeof setTimeout);
	const clear = spyOn(globalThis, "clearTimeout").mockImplementation(
		(handle) => {
			const entry = entries.find(
				(candidate) => candidate.handle === Number(handle),
			);
			if (entry) entry.cancelled = true;
			else originalClear(handle);
		},
	);
	restorers.push(() => {
		set.mockRestore();
		clear.mockRestore();
	});
	return entries;
}

function anchor(id: string, initialLeft: number | null) {
	const element = document.createElement("div");
	element.dataset.tourId = id;
	document.body.append(element);
	let left = initialLeft;
	const measure = spyOn(element, "getBoundingClientRect").mockImplementation(
		() =>
			new DOMRect(
				left ?? 0,
				100,
				left === null ? 0 : 80,
				left === null ? 0 : 40,
			),
	);
	restorers.push(() => {
		measure.mockRestore();
		element.remove();
	});
	return {
		measure,
		show: (nextLeft: number) => {
			left = nextLeft;
		},
	};
}

function props(anchorId: string): TourOverlayProps {
	return {
		steps: [{ anchorId, anchor: "Test anchor", body: "Test body" }],
		stepIndex: 0,
		onStepChange: mock(() => {}),
		onClose: mock(() => {}),
		labels: { prev: "Previous", next: "Next", skip: "Skip", done: "Done" },
	};
}

describe("TourOverlay with the real released timeout lifecycle", () => {
	it("measures a ready anchor synchronously without scheduling and preserves focus and keyboard behavior", () => {
		const timers = trapRetries();
		anchor("ready", 100);
		const options = props("ready");
		const view = render(
			<StrictMode>
				<TourOverlay {...options} />
			</StrictMode>,
		);
		expect(timers).toHaveLength(0);
		expect(
			view.container.querySelector<HTMLElement>(".tour-ring")?.style.left,
		).toBe("96px");
		const coach = view.container.querySelector<HTMLElement>(".tour-coach")!;
		expect(document.activeElement).toBe(coach);
		act(() => fireEvent.keyDown(coach, { key: "Escape" }));
		expect(options.onClose).toHaveBeenCalledWith(false);
		act(() => fireEvent.keyDown(coach, { key: "Enter" }));
		expect(options.onClose).toHaveBeenCalledWith(true);
	});

	it("retains exactly twenty attempts and stops when a later measurement succeeds", () => {
		const timers = trapRetries();
		const missing = anchor("missing", null);
		const view = render(
			<StrictMode>
				<TourOverlay {...props("missing")} />
			</StrictMode>,
		);
		expect(missing.measure).toHaveBeenCalledTimes(2);
		expect(timers[0]!.cancelled).toBe(true);
		for (let i = 1; i <= 19; i++) act(() => timers[i]!.callback());
		expect(timers).toHaveLength(20);
		expect(missing.measure).toHaveBeenCalledTimes(21); // One discarded StrictMode setup plus twenty live attempts.
		expect(view.container.querySelector(".tour-ring")).toBeNull();

		const late = anchor("late", null);
		view.rerender(
			<StrictMode>
				<TourOverlay {...props("late")} />
			</StrictMode>,
		);
		expect(timers).toHaveLength(21);
		late.show(200);
		act(() => timers[20]!.callback());
		expect(timers).toHaveLength(21);
		expect(late.measure).toHaveBeenCalledTimes(2);
		expect(
			view.container.querySelector<HTMLElement>(".tour-ring")?.style.left,
		).toBe("196px");
	});

	it("does not let a cancelled previous-anchor callback overwrite current geometry", () => {
		const timers = trapRetries();
		const old = anchor("old", null);
		anchor("current", 300);
		const view = render(
			<StrictMode>
				<TourOverlay {...props("old")} />
			</StrictMode>,
		);
		view.rerender(
			<StrictMode>
				<TourOverlay {...props("old")} />
			</StrictMode>,
		);
		expect(timers).toHaveLength(2); // New step objects with the same primitive key do not restart.
		const retained = timers[1]!;
		view.rerender(
			<StrictMode>
				<TourOverlay {...props("current")} />
			</StrictMode>,
		);
		expect(retained.cancelled).toBe(true);
		expect(
			view.container.querySelector<HTMLElement>(".tour-ring")?.style.left,
		).toBe("296px");
		old.show(100);
		act(() => retained.callback());
		expect(
			view.container.querySelector<HTMLElement>(".tour-ring")?.style.left,
		).toBe("296px");
	});

	it("fences StrictMode-discarded and unmounted callbacks before measuring or extending the retry chain", () => {
		const timers = trapRetries();
		const missing = anchor("unmount", null);
		const view = render(
			<StrictMode>
				<TourOverlay {...props("unmount")} />
			</StrictMode>,
		);
		expect(missing.measure).toHaveBeenCalledTimes(2);
		act(() => timers[0]!.callback());
		expect(missing.measure).toHaveBeenCalledTimes(2);
		expect(timers).toHaveLength(2);
		view.unmount();
		expect(timers[1]!.cancelled).toBe(true);
		act(() => timers[1]!.callback());
		expect(missing.measure).toHaveBeenCalledTimes(2);
		expect(timers).toHaveLength(2);
	});
});
