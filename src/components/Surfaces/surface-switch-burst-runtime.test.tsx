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
afterEach(() => {
	try {
		cleanup();
	} finally {
		for (const restore of restorers.splice(0).reverse()) restore();
		_resetSurfaceAnchorsForTests();
	}
});

function fixture(
	options: {
		strict?: boolean;
		synchronous?: boolean;
		failRequest?: boolean;
	} = {},
) {
	_resetSurfaceAnchorsForTests();
	let failCancel = false;
	const frames: {
		handle: number;
		callback: FrameRequestCallback;
		cancelled: boolean;
		fired: boolean;
	}[] = [];
	const request = spyOn(globalThis, "requestAnimationFrame").mockImplementation(
		(callback) => {
			const frame = {
				handle: frames.length,
				callback,
				cancelled: false,
				fired: false,
			};
			frames.push(frame);
			if (options.failRequest) throw new Error("registered then failed");
			if (options.synchronous) {
				frame.fired = true;
				callback(0);
			}
			return frame.handle;
		},
	);
	const cancel = spyOn(globalThis, "cancelAnimationFrame").mockImplementation(
		(handle) => {
			const frame = frames.find((candidate) => candidate.handle === handle);
			if (frame) frame.cancelled = true;
			if (failCancel) throw new Error("frame cancellation failed");
		},
	);
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
	restorers.push(() => {
		failCancel = false;
		rect.mockRestore();
		anchor.remove();
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
		frames.filter((frame) => !frame.cancelled && !frame.fired);
	const flush = () => {
		const frame = pending()[0];
		if (!frame) throw new Error("expected a pending frame");
		frame.fired = true;
		act(() => frame.callback(0));
	};
	return {
		view,
		frames,
		rect,
		pending,
		flush,
		failCleanup: () => {
			failCancel = true;
		},
	};
}

describe("surface switch burst with the real component and public lifecycle", () => {
	it("measures synchronously, defers the first burst tick and stops after exactly 30 frames", () => {
		const { rect, frames, pending, flush } = fixture();
		expect(rect.mock.calls.length).toBeGreaterThan(0);
		const initialMeasures = rect.mock.calls.length;
		expect(frames).toHaveLength(1);
		const item = document.querySelector<HTMLElement>(
			".fx-surface-keepalive-item",
		)!;
		expect(item.style.width).toBe("640px");
		expect(item.style.visibility).toBe("visible");
		for (let index = 0; index < 30; index++) {
			expect(pending()).toHaveLength(1);
			flush();
			expect(rect.mock.calls.length).toBe(initialMeasures + index + 1);
		}
		expect(frames).toHaveLength(30);
		expect(pending()).toHaveLength(0);
	});

	it("keeps ordinary relayout coalescing independent of the 30-frame burst", () => {
		const { rect, frames, pending, flush } = fixture();
		const initialMeasures = rect.mock.calls.length;
		act(() => {
			pingAnchorRelayout();
			pingAnchorRelayout();
		});
		expect(pending()).toHaveLength(2);
		for (let index = 0; index < 31; index++) flush();
		expect(pending()).toHaveLength(0);
		expect(frames).toHaveLength(31);
		expect(rect.mock.calls.length).toBe(initialMeasures + 31);
	});

	it("fences the discarded StrictMode burst even when the first handle is zero", () => {
		const { frames, rect, pending } = fixture({ strict: true });
		expect(frames).toHaveLength(2);
		expect(frames[0]!.cancelled).toBe(true);
		const initialMeasures = rect.mock.calls.length;
		act(() => frames[0]!.callback(0));
		expect(rect.mock.calls.length).toBe(initialMeasures);
		expect(frames).toHaveLength(2);
		expect(pending()).toHaveLength(1);
	});

	it("cancels both independent pending frames and fences retained callbacks after unmount", () => {
		const { view, frames, pending } = fixture();
		act(() => pingAnchorRelayout());
		expect(pending()).toHaveLength(2);
		view.unmount();
		expect(pending()).toHaveLength(0);
		act(() => {
			for (const frame of [...frames]) frame.callback(0);
		});
		expect(frames).toHaveLength(2);
	});

	it("isolates cancellation failure and still fences the retained burst callback", () => {
		const { view, frames, failCleanup } = fixture({ strict: true });
		failCleanup();
		expect(() => view.unmount()).not.toThrow();
		act(() => {
			for (const frame of [...frames]) frame.callback(0);
		});
		expect(frames).toHaveLength(2);
	});

	it("isolates register-then-throw and fences the retained callback", () => {
		const { view, frames, rect } = fixture({ failRequest: true });
		const initialMeasures = rect.mock.calls.length;
		act(() => frames[0]!.callback(0));
		expect(rect.mock.calls.length).toBe(initialMeasures);
		expect(frames).toHaveLength(1);
		expect(() => view.unmount()).not.toThrow();
	});

	it("retains the 30-tick cap with a synchronous scheduler", () => {
		const { frames, pending, view } = fixture({ synchronous: true });
		expect(frames).toHaveLength(30);
		expect(pending()).toHaveLength(0);
		expect(() => view.unmount()).not.toThrow();
	});
});
