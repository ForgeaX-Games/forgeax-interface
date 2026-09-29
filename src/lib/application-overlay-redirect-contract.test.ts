import { afterEach, describe, expect, test } from "bun:test";
import { installApplicationOverlayRedirect } from "../application";
import { useShellStore } from "../store";

const disposers: Array<() => void> = [];
afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
	useShellStore.setState({ activeOverlay: null, overlayParam: null });
});

describe("public application overlay redirection", () => {
	test("clears the matching overlay before handing intent to the product, once per request", () => {
		const observed: Array<string | null> = [];
		disposers.push(
			installApplicationOverlayRedirect("settings", () => {
				observed.push(useShellStore.getState().activeOverlay);
			}),
		);
		useShellStore.getState().openOverlay("settings", "providers");
		useShellStore.getState().openOverlay("settings");
		expect(observed).toEqual([null, null]);
		expect(useShellStore.getState().overlayParam).toBe("providers");
	});

	test("does not consume other overlays or run on installation", () => {
		useShellStore.getState().openOverlay("settings");
		let calls = 0;
		disposers.push(
			installApplicationOverlayRedirect("settings", () => {
				calls++;
			}),
		);
		expect(calls).toBe(0);
		useShellStore.getState().openOverlay("dashboard");
		expect(calls).toBe(0);
		expect(useShellStore.getState().activeOverlay).toBe("dashboard");
	});

	test("balances disposal without retaining a product callback", () => {
		let calls = 0;
		const dispose = installApplicationOverlayRedirect("settings", () => {
			calls++;
		});
		disposers.push(dispose);
		dispose();
		dispose();
		useShellStore.getState().openOverlay("settings");
		expect(calls).toBe(0);
		expect(useShellStore.getState().activeOverlay).toBe("settings");
	});

	test("guards synchronous product reentry and remains available for the next request", () => {
		let calls = 0;
		disposers.push(
			installApplicationOverlayRedirect("settings", () => {
				calls++;
				useShellStore.getState().openOverlay("settings");
			}),
		);
		useShellStore.getState().openOverlay("settings");
		expect(calls).toBe(1);
		useShellStore.getState().openOverlay("settings");
		expect(calls).toBe(2);
	});

	test("preserves callback errors while releasing the reentry guard", () => {
		const error = new Error("product failure");
		let calls = 0;
		disposers.push(
			installApplicationOverlayRedirect("settings", () => {
				calls++;
				if (calls === 1) throw error;
			}),
		);
		expect(() => useShellStore.getState().openOverlay("settings")).toThrow(
			error,
		);
		expect(useShellStore.getState().activeOverlay).toBeNull();
		useShellStore.getState().openOverlay("settings");
		expect(calls).toBe(2);
	});
});
