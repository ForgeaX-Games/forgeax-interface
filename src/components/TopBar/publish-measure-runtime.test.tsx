import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { PublishOnboarding } from "./PublishOnboarding";

const restore: (() => void)[] = [];
const prepareCleanup: (() => void)[] = [];
afterEach(() => {
	for (const prepare of prepareCleanup.splice(0)) prepare();
	try {
		cleanup();
	} finally {
		for (const reset of restore.splice(0).reverse()) reset();
	}
});

function fixture(
	options: {
		missing?: boolean;
		strict?: boolean;
		synchronous?: boolean;
		failDelay?: number;
	} = {},
) {
	const timers: {
		handle: number;
		delay: number;
		callback: () => void;
		clears: number;
	}[] = [];
	const measurements: string[] = [];
	let failClear = false;
	let missing = options.missing ?? false;
	const nativeSet = globalThis.setTimeout.bind(globalThis);
	const nativeClear = globalThis.clearTimeout.bind(globalThis);
	const request = spyOn(globalThis, "setTimeout").mockImplementation(((
		callback: () => void,
		delay?: number,
		...args: unknown[]
	) => {
		if (![20, 45, 150].includes(delay ?? 0))
			return nativeSet(callback, delay, ...args);
		const timer = { handle: timers.length, delay: delay!, callback, clears: 0 };
		timers.push(timer);
		if (delay === options.failDelay)
			throw new Error("scheduler retained callback then threw");
		if (options.synchronous) callback();
		return timer.handle;
	}) as typeof setTimeout);
	const cancel = spyOn(globalThis, "clearTimeout").mockImplementation(
		(handle) => {
			const timer = timers.find((item) => item.handle === Number(handle));
			if (!timer) {
				nativeClear(handle);
				return;
			}
			timer.clears++;
			if (failClear) throw new Error("native cancellation failed");
		},
	);
	const anchor = document.createElement("button");
	const rect = spyOn(anchor, "getBoundingClientRect").mockReturnValue({
		top: 50,
		left: 400,
		width: 100,
		height: 30,
		right: 500,
		bottom: 80,
		x: 400,
		y: 50,
		toJSON: () => ({}),
	});
	const query = document.querySelector.bind(document);
	const lookup = spyOn(document, "querySelector").mockImplementation(((
		selector: string,
	) => {
		if (
			selector === ".tb-publish-btn" ||
			selector.startsWith("[data-onboard=")
		) {
			measurements.push(selector);
			return missing ? null : anchor;
		}
		return query(selector);
	}) as typeof document.querySelector);
	const props = {
		active: true,
		onClose: () => {},
		setMenuOpen: (_open: boolean) => {},
		t: (key: string) => key,
	};
	prepareCleanup.push(() => {
		failClear = false;
	});
	restore.push(() => {
		lookup.mockRestore();
		rect.mockRestore();
		cancel.mockRestore();
		request.mockRestore();
	});
	const view = render(<PublishOnboarding {...props} />, {
		reactStrictMode: options.strict ?? false,
	});
	const fire = (index: number) => act(() => timers[index]!.callback());
	return {
		view,
		timers,
		measurements,
		rect,
		fire,
		missing: (value: boolean) => {
			missing = value;
		},
		failCleanup: () => {
			failClear = true;
		},
		close: () => view.rerender(<PublishOnboarding {...props} active={false} />),
	};
}

describe("publish onboarding measurement with real component and public timeout owners", () => {
	it("defers the intro by 20ms, menu by 150ms and stops immediately on successful measurement", () => {
		const f = fixture();
		expect(f.measurements).toHaveLength(0);
		expect(f.timers.map((item) => item.delay)).toEqual([20]);
		f.fire(0);
		expect(document.querySelector<HTMLElement>(".fx-ob-spot")!.style.left).toBe(
			"394px",
		);
		expect(f.timers).toHaveLength(1);
		fireEvent.click(document.querySelector(".fx-ob-btn.primary")!);
		expect(f.timers.map((item) => item.delay)).toEqual([20, 150]);
		expect(f.measurements).toHaveLength(1);
		f.fire(1);
		expect(f.measurements.at(-1)).toBe('[data-onboard="web"]');
		expect(
			document.querySelector(".fx-ob-tip")!.getAttribute("data-arrow"),
		).toBe("right");
		expect(f.timers).toHaveLength(2);
	});

	it("keeps exactly thirteen failed measurements and twelve 45ms retries", () => {
		const f = fixture({ missing: true });
		for (let index = 0; index < 13; index++) f.fire(index);
		expect(f.measurements).toHaveLength(13);
		expect(f.timers.map((item) => item.delay)).toEqual([
			20,
			...Array(12).fill(45),
		]);
		expect(document.querySelector(".fx-ob-tip")).toBeNull();
		f.fire(12);
		expect(f.measurements).toHaveLength(13);
	});

	it("stops retrying when the anchor appears and keeps resize independent of the retry budget", () => {
		const f = fixture({ missing: true });
		f.fire(0);
		expect(f.timers.map((item) => item.delay)).toEqual([20, 45]);
		act(() => window.dispatchEvent(new Event("resize")));
		expect(f.timers).toHaveLength(2);
		f.missing(false);
		f.fire(1);
		expect(document.querySelector(".fx-ob-tip")).not.toBeNull();
		expect(f.timers).toHaveLength(2);
		f.fire(0);
		f.fire(1);
		expect(f.measurements).toHaveLength(3);
	});

	it("fences retained prior-step callbacks from overwriting current geometry", () => {
		const f = fixture();
		f.fire(0);
		fireEvent.click(document.querySelector(".fx-ob-btn.primary")!);
		f.fire(1);
		expect(
			document.querySelector(".fx-ob-tip")!.getAttribute("data-arrow"),
		).toBe("right");
		f.fire(0);
		expect(
			document.querySelector(".fx-ob-tip")!.getAttribute("data-arrow"),
		).toBe("right");
		expect(f.measurements).toHaveLength(2);
	});

	it("cancels a menu retry when returning to the intro without restarting its old loop", () => {
		const f = fixture();
		f.fire(0);
		fireEvent.click(document.querySelector(".fx-ob-btn.primary")!);
		f.missing(true);
		f.fire(1);
		expect(f.timers.map((item) => item.delay)).toEqual([20, 150, 45]);
		const prev = Array.from(document.querySelectorAll("button")).find(
			(button) => button.textContent === "topbar.onboard.prev",
		)!;
		fireEvent.click(prev);
		expect(f.timers[2]!.clears).toBe(1);
		f.missing(false);
		f.fire(3);
		const measured = f.measurements.length;
		f.fire(2);
		expect(f.measurements).toHaveLength(measured);
		expect(f.timers.map((item) => item.delay)).toEqual([20, 150, 45, 20]);
		expect(
			document.querySelector(".fx-ob-tip")!.getAttribute("data-arrow"),
		).toBe("up");
	});

	for (const phase of ["initial", "retry"] as const) {
		it(`cancels ${phase} and fences retained callbacks after close despite clear failures`, () => {
			const f = fixture({ missing: true });
			if (phase === "retry") f.fire(0);
			const pending = f.timers.at(-1)!;
			const measured = f.measurements.length;
			const scheduled = f.timers.length;
			f.failCleanup();
			expect(() => f.close()).not.toThrow();
			expect(pending.clears).toBe(1);
			act(() => {
				for (const timer of f.timers) timer.callback();
			});
			expect(f.measurements).toHaveLength(measured);
			expect(f.timers).toHaveLength(scheduled);
		});
	}

	it("balances StrictMode setup and terminal unmount, including a zero handle", () => {
		const f = fixture({ missing: true, strict: true });
		expect(f.timers.map((item) => item.delay)).toEqual([20, 20]);
		expect(f.timers[0]!.clears).toBe(1);
		f.fire(0);
		expect(f.measurements).toHaveLength(0);
		f.fire(1);
		expect(f.timers.at(-1)!.delay).toBe(45);
		f.view.unmount();
		const measured = f.measurements.length;
		const scheduled = f.timers.length;
		act(() => {
			for (const timer of f.timers) timer.callback();
		});
		expect(f.measurements).toHaveLength(measured);
		expect(f.timers).toHaveLength(scheduled);
		expect(f.timers.map((item) => item.clears)).toEqual([1, 0, 1]);
	});

	for (const failDelay of [20, 45]) {
		it(`isolates register-then-throw at ${failDelay}ms and fences its retained callback`, () => {
			const f = fixture({ missing: true, failDelay });
			if (failDelay === 45) expect(() => f.fire(0)).not.toThrow();
			const count = f.measurements.length;
			const scheduled = f.timers.length;
			f.fire(scheduled - 1);
			expect(f.measurements).toHaveLength(count);
			expect(f.timers).toHaveLength(scheduled);
			expect(() => f.view.unmount()).not.toThrow();
		});
	}

	it("isolates measurement exceptions without creating a retry or breaking disposal", () => {
		const f = fixture();
		f.rect.mockImplementation(() => {
			throw new Error("geometry unavailable");
		});
		expect(() => f.fire(0)).not.toThrow();
		expect(f.timers).toHaveLength(1);
		f.fire(0);
		expect(f.measurements).toHaveLength(1);
		f.view.unmount();
	});

	it("initializes both owners before a synchronous scheduler can exhaust retries", () => {
		const f = fixture({ missing: true, synchronous: true });
		expect(f.measurements).toHaveLength(13);
		expect(f.timers.map((item) => item.delay)).toEqual([
			20,
			...Array(12).fill(45),
		]);
		act(() => {
			for (const timer of f.timers) timer.callback();
		});
		expect(f.measurements).toHaveLength(13);
		f.view.unmount();
		expect(f.timers.every((item) => item.clears === 0)).toBe(true);
	});
});
