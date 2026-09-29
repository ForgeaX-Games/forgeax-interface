import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { DockviewApi } from "dockview";
import { installEdgeDrawer } from "./edgeDrawer";
import { FOOTER_PANEL_ID_LIST } from "./footer-panels";

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function fixture() {
	// Use real DOM moves, document capture listeners and the real public
	// observation lifecycles; only Dockview's model/event sources are stubbed.
	const request = spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);
	const cancel = spyOn(globalThis, "cancelAnimationFrame").mockImplementation(
		() => {},
	);
	cleanups.push(() => {
		cancel.mockRestore();
		request.mockRestore();
	});
	const root = document.createElement("div");
	const footer = document.createElement("footer");
	footer.dataset.fxDockBottomHost = "";
	const outside = document.createElement("button");
	const groupElement = document.createElement("div");
	groupElement.className = "dv-groupview-edge dv-groupview-header-bottom";
	const strip = document.createElement("div");
	strip.className = "dv-tabs-and-actions-container";
	const tabs = document.createElement("div");
	tabs.className = "dv-tabs-container";
	const content = document.createElement("div");
	content.className = "dv-content-container";
	strip.append(tabs);
	groupElement.append(strip, content);
	root.append(groupElement);
	document.body.append(root, footer, outside);
	cleanups.push(() => {
		root.remove();
		footer.remove();
		outside.remove();
	});
	const subscribe = () => ({ dispose() {} });
	const panels = FOOTER_PANEL_ID_LIST.map((id) => ({
		id,
		api: { setActive() {} },
	}));
	const group = {
		id: "footer-test",
		element: groupElement,
		panels,
		activePanel: panels[0],
		model: {},
		api: {
			location: { type: "edge", position: "bottom" },
			collapse() {},
			onDidCollapsedChange: subscribe,
		},
	};
	for (const panel of panels) {
		const tab = document.createElement("button");
		tab.className = "dv-tab";
		tab.textContent = panel.id;
		tabs.append(tab);
		panel.api.setActive = () => {
			group.activePanel = panel;
		};
	}
	const api = {
		groups: [group],
		activePanel: panels[0],
		getEdgeGroup: () => group,
		getPanel: (id: string) => panels.find((panel) => panel.id === id),
		setEdgeGroupVisible() {},
		onDidLayoutChange: subscribe,
		onDidAddPanel: subscribe,
		onDidRemovePanel: subscribe,
		onDidLayoutFromJSON: subscribe,
		onDidActivePanelChange: subscribe,
		onWillDrop: subscribe,
	} as unknown as DockviewApi;
	const dispose = installEdgeDrawer(api, root);
	cleanups.push(dispose);
	expect(strip.parentElement).toBe(footer);
	expect(groupElement.contains(strip)).toBe(false);
	const tab = tabs.firstElementChild as HTMLButtonElement;
	const isOpen = () => groupElement.classList.contains("fx-edge-drawer-open");
	const pointerDown = (target: Element) =>
		target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	const click = (target: Element) =>
		target.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		);
	click(tab);
	expect(isOpen()).toBe(true);
	expect(content.parentElement?.className).toBe("fx-edge-drawer-portal-host");
	return {
		tab,
		tabs,
		strip,
		footer,
		outside,
		content,
		groupElement,
		group,
		panels,
		isOpen,
		pointerDown,
		click,
	};
}

describe("relocated footer strip with portaled drawer", () => {
	it("keeps footer pointerdown contained, then retains ordinary active-tab click dismissal", () => {
		const f = fixture();
		f.pointerDown(f.tab);
		expect(f.isOpen()).toBe(true);
		f.click(f.tab);
		expect(f.isOpen()).toBe(false);
	});

	it("preserves an active footer tab click used to return from an owned popup", () => {
		const f = fixture();
		const popup = document.createElement("div");
		popup.dataset.fxInteractionScope = "footer-test";
		document.body.append(popup);
		cleanups.push(() => popup.remove());
		f.pointerDown(f.tab);
		expect(f.isOpen()).toBe(true);
		// The popup consumes the outside interaction before the click phase.
		popup.remove();
		f.click(f.tab);
		expect(f.isOpen()).toBe(true);
		f.pointerDown(f.tab);
		f.click(f.tab);
		expect(f.isOpen()).toBe(false);
	});

	it("keeps group, portaled content and resize grip inside, but dismisses an unrelated target", () => {
		const f = fixture();
		const grip = document.querySelector(".fx-edge-drawer-grip")!;
		for (const target of [f.groupElement, f.content, grip]) {
			f.pointerDown(target);
			expect(f.isOpen()).toBe(true);
		}
		document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
		f.pointerDown(f.outside);
		expect(f.isOpen()).toBe(false);
	});

	it("keeps the relocated strip open through a same-strip panel switch", () => {
		const f = fixture();
		const next = f.tabs.children[1]!;
		f.pointerDown(next);
		expect(f.isOpen()).toBe(true);
		f.click(next);
		expect(f.isOpen()).toBe(true);
		expect(f.group.activePanel).toBe(f.panels[1]);
	});
});
