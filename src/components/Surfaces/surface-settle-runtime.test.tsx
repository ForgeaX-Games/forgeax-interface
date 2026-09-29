import "../../lib/telemetry-test-prelude";
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createAppHost, HostProvider } from "../../core/app-shell";
import {
	_resetSurfaceAnchorsForTests,
	pingAnchorRelayout,
	setAnchor,
} from "../../lib/surfaceAnchors";
import { SurfaceKeepAliveLayer } from "./SurfaceKeepAliveLayer";

const restorers: (() => void)[] = [];
const prepareCleanup: (() => void)[] = [];
afterEach(() => {
	for (const prepare of prepareCleanup.splice(0)) prepare();
	try {
		cleanup();
	} finally {
		for (const restore of restorers.splice(0).reverse()) restore();
		_resetSurfaceAnchorsForTests();
	}
});

function fixture(
	options: { strict?: boolean; synchronous?: boolean; failDelay?: number } = {},
) {
	_resetSurfaceAnchorsForTests();
	let failClear = false;
	const timers: {
		handle: number;
		delay: number;
		callback: () => void;
		clears: number;
	}[] = [];
	const frames: {
		callback: FrameRequestCallback;
		fired: boolean;
		cancelled: boolean;
	}[] = [];
	const trace: string[] = [];
	const originalSet = globalThis.setTimeout.bind(globalThis);
	const originalClear = globalThis.clearTimeout.bind(globalThis);
	const request = spyOn(globalThis, "setTimeout").mockImplementation(((
		callback: () => void,
		delay?: number,
		...args: unknown[]
	) => {
		if (![60, 120, 180, 240].includes(delay ?? 0))
			return originalSet(callback, delay, ...args);
		const timer = {
			handle: 970_000 + timers.length,
			delay: delay!,
			callback,
			clears: 0,
		};
		timers.push(timer);
		trace.push(`schedule:${timer.handle}`);
		if (options.failDelay === delay)
			throw new Error("timeout retained callback then threw");
		if (options.synchronous) callback();
		return timer.handle;
	}) as typeof setTimeout);
	const cancel = spyOn(globalThis, "clearTimeout").mockImplementation(
		(handle) => {
			const timer = timers.find(
				(candidate) => candidate.handle === Number(handle),
			);
			if (!timer) {
				originalClear(handle);
				return;
			}
			timer.clears++;
			trace.push(`cancel:${timer.handle}`);
			if (failClear) throw new Error("native timeout cancellation failed");
		},
	);
	const raf = spyOn(globalThis, "requestAnimationFrame").mockImplementation(
		(callback) => {
			frames.push({ callback, fired: false, cancelled: false });
			return frames.length - 1;
		},
	);
	const caf = spyOn(globalThis, "cancelAnimationFrame").mockImplementation(
		(handle) => {
			if (frames[handle]) frames[handle]!.cancelled = true;
		},
	);
	const viewportDescriptor = Object.getOwnPropertyDescriptor(
		window,
		"visualViewport",
	);
	const viewport = new EventTarget();
	Object.defineProperty(window, "visualViewport", {
		configurable: true,
		value: viewport,
	});
	const anchor = document.createElement("div");
	document.body.appendChild(anchor);
	const rect = spyOn(anchor, "getBoundingClientRect").mockReturnValue({
		top: 20,
		left: 10,
		right: 650,
		bottom: 380,
		width: 640,
		height: 360,
		x: 10,
		y: 20,
		toJSON: () => ({}),
	});
	setAnchor("edit", anchor);
	prepareCleanup.push(() => {
		failClear = false;
	});
	restorers.push(() => {
		rect.mockRestore();
		anchor.remove();
		if (viewportDescriptor)
			Object.defineProperty(window, "visualViewport", viewportDescriptor);
		else Reflect.deleteProperty(window, "visualViewport");
		caf.mockRestore();
		raf.mockRestore();
		cancel.mockRestore();
		request.mockRestore();
	});
	const { host } = createAppHost();
	const view = render(
		<HostProvider value={host}>
			<SurfaceKeepAliveLayer />
		</HostProvider>,
		{ reactStrictMode: options.strict ?? false },
	);
	const pending = () =>
		frames.filter((frame) => !frame.fired && !frame.cancelled);
	const flushFrame = () => {
		const frame = pending()[0];
		if (!frame) throw new Error("expected a pending layout frame");
		frame.fired = true;
		act(() => frame.callback(0));
	};
	// Drain only the independent switch burst before exercising settle work.
	for (let index = 0; index < 30; index++) flushFrame();
	expect(pending()).toHaveLength(0);
	const emit = (source: "window" | "viewport" | "scroll" = "window") =>
		act(() => {
			if (source === "viewport") viewport.dispatchEvent(new Event("resize"));
			else if (source === "scroll")
				anchor.dispatchEvent(new Event("scroll", { bubbles: false }));
			else window.dispatchEvent(new Event("resize"));
		});
	return {
		timers,
		frames,
		trace,
		pending,
		flushFrame,
		emit,
		rect,
		view,
		failCleanup: () => {
			failClear = true;
		},
	};
}

describe("surface settle timers with the real component and public lifecycles", () => {
	it("keeps four independent deadlines and one immediate coalesced frame on every source", () => {
		const f = fixture();
		expect(f.timers).toHaveLength(0);
		for (const source of ["window", "viewport", "scroll"] as const) {
			f.emit(source);
			expect(f.timers.slice(-4).map((timer) => timer.delay)).toEqual([
				60, 120, 180, 240,
			]);
			expect(f.pending()).toHaveLength(1);
			f.flushFrame();
		}
		const item = document.querySelector<HTMLElement>(
			".fx-surface-keepalive-item",
		)!;
		expect(item.style.width).toBe("640px");
		expect(item.style.visibility).toBe("visible");
	});

	it("cancels the entire previous burst before registering any replacement", () => {
		const f = fixture();
		f.emit();
		f.trace.length = 0;
		f.emit();
		expect(f.trace).toEqual([
			"cancel:970000",
			"cancel:970001",
			"cancel:970002",
			"cancel:970003",
			"schedule:970004",
			"schedule:970005",
			"schedule:970006",
			"schedule:970007",
		]);
		f.flushFrame();
		act(() => {
			for (const timer of f.timers.slice(0, 4)) timer.callback();
		});
		expect(f.pending()).toHaveLength(0);
		for (const timer of f.timers.slice(4)) {
			const before = f.rect.mock.calls.length;
			act(() => timer.callback());
			expect(f.pending()).toHaveLength(1);
			f.flushFrame();
			expect(f.rect.mock.calls.length).toBe(before + 1);
			act(() => timer.callback());
			expect(f.pending()).toHaveLength(0);
		}
	});

	it("keeps anchor relayout independent and coalesces simultaneous settle callbacks", () => {
		const f = fixture();
		act(() => {
			pingAnchorRelayout();
			pingAnchorRelayout();
		});
		expect(f.timers).toHaveLength(0);
		expect(f.pending()).toHaveLength(1);
		f.flushFrame();
		f.emit();
		f.flushFrame();
		act(() => {
			for (const timer of f.timers) timer.callback();
		});
		expect(f.pending()).toHaveLength(1);
		f.flushFrame();
	});

	it("restarts all four and fences old callbacks even when native cancellation throws", () => {
		const f = fixture();
		f.emit();
		f.failCleanup();
		f.emit();
		expect(f.timers).toHaveLength(8);
		expect(f.timers.slice(0, 4).map((timer) => timer.clears)).toEqual([
			1, 1, 1, 1,
		]);
		f.flushFrame();
		act(() => {
			for (const timer of f.timers.slice(0, 4)) timer.callback();
		});
		expect(f.pending()).toHaveLength(0);
	});

	it("disposes every timer and adjacent frame/observation owners after StrictMode unmount despite cleanup failures", () => {
		const f = fixture({ strict: true });
		f.emit();
		f.failCleanup();
		expect(() => f.view.unmount()).not.toThrow();
		expect(f.timers.map((timer) => timer.clears)).toEqual([1, 1, 1, 1]);
		expect(f.pending()).toHaveLength(0);
		const frameCount = f.frames.length;
		act(() => {
			for (const timer of f.timers) timer.callback();
			pingAnchorRelayout();
		});
		f.emit();
		f.emit("viewport");
		expect(f.frames).toHaveLength(frameCount);
		expect(f.timers).toHaveLength(4);
	});

	it("isolates one register-then-throw without dropping the other deadlines", () => {
		const f = fixture({ failDelay: 120 });
		f.emit();
		expect(f.timers.map((timer) => timer.delay)).toEqual([60, 120, 180, 240]);
		f.flushFrame();
		act(() => f.timers[1]!.callback());
		expect(f.pending()).toHaveLength(0);
		act(() => f.timers[2]!.callback());
		expect(f.pending()).toHaveLength(1);
		f.view.unmount();
		expect(f.timers[1]!.clears).toBe(0);
	});

	it("supports synchronous timeout callbacks without replaying them or retaining completed handles", () => {
		const f = fixture({ synchronous: true });
		f.emit();
		expect(f.timers.map((timer) => timer.delay)).toEqual([60, 120, 180, 240]);
		expect(f.pending()).toHaveLength(1);
		f.flushFrame();
		act(() => {
			for (const timer of f.timers) timer.callback();
		});
		expect(f.pending()).toHaveLength(0);
		f.view.unmount();
		expect(f.timers.map((timer) => timer.clears)).toEqual([0, 0, 0, 0]);
	});
});
