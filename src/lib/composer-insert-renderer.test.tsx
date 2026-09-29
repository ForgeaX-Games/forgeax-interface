import { expect, test } from "bun:test";
import { act, createElement } from "react";
import type {
	ComposerInsertRuntime,
	ComposerInsertRuntimeFactory,
} from "./composer-insert-runtime";

// Run in its own test process: the product binding intentionally has page
// lifetime. Do not add a production reset API merely for test isolation.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test("real compatibility hook follows the product queue across unmount and retry", async () => {
	const bridge = await import("./composer-bridge");
	const { createRoot } = await import("react-dom/client");
	const pill = (display: string): import("./composer-bridge").PillPayload => ({
		kind: "file",
		display,
		detail: display,
		tooltip: { title: display, lines: [] },
	});
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	function Host() {
		return createElement(
			"span",
			null,
			bridge.useComposerPendingInsert()?.display ?? "empty",
		);
	}
	let product!: ComposerInsertRuntime;
	const factory: ComposerInsertRuntimeFactory = (seed) => {
		let queue = [...seed];
		const listeners = new Set<() => void>();
		const emit = () => {
			for (const listener of listeners) listener();
		};
		product = {
			getQueue: () => queue,
			subscribe(listener) {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			request(payload) {
				queue = [...queue, payload];
				emit();
			},
			clear() {
				queue = queue.slice(1);
				emit();
			},
		};
		return product;
	};
	try {
		bridge.requestComposerInsert(pill("early"));
		act(() => root.render(createElement(Host)));
		expect(container.textContent).toBe("early");
		act(() => bridge.configureComposerInsertRuntime(factory));
		act(() => product.request(pill("product")));
		act(() => bridge.clearComposerPendingInsert());
		expect(container.textContent).toBe("product");
		act(() => root.render(null));
		bridge.requestComposerInsert(pill("compatibility"));
		act(() => root.render(createElement(Host)));
		expect(container.textContent).toBe("product");
		act(() => bridge.clearComposerPendingInsert());
		expect(container.textContent).toBe("compatibility");
		act(() => bridge.configureComposerInsertRuntime(factory));
		act(() => product.clear());
		expect(container.textContent).toBe("empty");
	} finally {
		act(() => root.unmount());
		container.remove();
	}
});
