import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import type { IDockviewDefaultTabProps } from "dockview";
import { useHealthStore } from "../StatusBar/healthStore";
import { DockTab } from "./DockTab";
import { clearEdgePins, setEdgePin } from "./edgePinStore";

function pointerEvent(
	type: string,
	init: { pointerId: number; button?: number },
): PointerEvent {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		pointerId: { value: init.pointerId },
		button: { value: init.button ?? 0 },
		isPrimary: { value: true },
	});
	return event as PointerEvent;
}

function tabProps(
	close: () => void,
	overrides: Partial<IDockviewDefaultTabProps> = {},
): IDockviewDefaultTabProps {
	const disposable = { dispose: () => undefined };
	return {
		api: {
			id: "main",
			title: "Main",
			group: { id: "group" },
			location: { type: "grid" },
			close,
			onDidTitleChange: () => disposable,
			onDidLocationChange: () => disposable,
		},
		containerApi: {},
		params: {},
		hideClose: false,
		tabLocation: "header",
		...overrides,
	} as unknown as IDockviewDefaultTabProps;
}

afterEach(() => {
	cleanup();
	clearEdgePins();
	useHealthStore.getState().clear();
});

describe("DockTab close interaction adapter", () => {
	it("keeps Dockview title events as the fallback for uncatalogued panels", () => {
		type TitleListener = Parameters<
			IDockviewDefaultTabProps["api"]["onDidTitleChange"]
		>[0];
		type TitleEvent = Parameters<TitleListener>[0];
		let titleListener: TitleListener | undefined;
		const props = tabProps(() => undefined);
		Object.assign(props.api, {
			id: "extension.uncatalogued",
			title: "Initial title",
			onDidTitleChange: (listener: TitleListener) => {
				titleListener = listener;
				return { dispose: () => undefined };
			},
		});

		const view = render(<DockTab {...props} />);
		expect(
			view.container.querySelector(".fx-dock-tab-title")?.textContent,
		).toBe("Initial title");

		Object.assign(props.api, { title: "Updated title" });
		act(() => titleListener?.({ title: "Updated title" } as TitleEvent));
		expect(
			view.container.querySelector(".fx-dock-tab-title")?.textContent,
		).toBe("Updated title");
	});

	it("projects live Dockview edge and group placement into the pin action", () => {
		let locationListener: (() => void) | undefined;
		const props = tabProps(() => undefined);
		Object.assign(props.api, {
			id: "console",
			onDidLocationChange: (listener: () => void) => {
				locationListener = listener;
				return { dispose: () => undefined };
			},
		});

		const view = render(<DockTab {...props} />);
		expect(view.container.querySelector(".fx-edge-pin")).toBeNull();

		Object.assign(props.api, {
			location: { type: "edge" },
			group: { id: "edge-left" },
		});
		act(() => {
			setEdgePin("edge-left", "console");
			locationListener?.();
		});
		expect(
			view.container
				.querySelector(".fx-edge-pin")
				?.getAttribute("aria-pressed"),
		).toBe("true");

		Object.assign(props.api, { group: { id: "edge-right" } });
		act(() => locationListener?.());
		expect(
			view.container
				.querySelector(".fx-edge-pin")
				?.getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("routes native close and matching middle-button gestures to Dockview", () => {
		let closes = 0;
		const view = render(
			<DockTab
				{...tabProps(() => {
					closes++;
				})}
			/>,
		);
		const tab = view.getByTestId("dockview-dv-default-tab");
		const action = tab.querySelector<HTMLElement>(".dv-default-tab-action")!;

		const closeDown = pointerEvent("pointerdown", { pointerId: 1 });
		act(() => action.dispatchEvent(closeDown));
		expect(closeDown.defaultPrevented).toBe(true);
		expect(closes).toBe(1);

		act(() =>
			tab.dispatchEvent(
				pointerEvent("pointerdown", { pointerId: 2, button: 1 }),
			),
		);
		act(() =>
			tab.dispatchEvent(pointerEvent("pointerup", { pointerId: 2, button: 1 })),
		);
		expect(closes).toBe(2);
	});

	it("keeps hide-close and close override policy in Interface", () => {
		let apiCloses = 0;
		let overrideCloses = 0;
		const view = render(
			<DockTab
				{...tabProps(
					() => {
						apiCloses++;
					},
					{
						closeActionOverride: () => {
							overrideCloses++;
						},
					},
				)}
			/>,
		);
		const tab = view.getByTestId("dockview-dv-default-tab");
		act(() =>
			tab
				.querySelector<HTMLElement>(".dv-default-tab-action")
				?.dispatchEvent(pointerEvent("pointerdown", { pointerId: 3 })),
		);
		expect(apiCloses).toBe(0);
		expect(overrideCloses).toBe(1);

		view.rerender(
			<DockTab
				{...tabProps(
					() => {
						apiCloses++;
					},
					{ hideClose: true },
				)}
			/>,
		);
		expect(tab.querySelector(".dv-default-tab-action")).toBeNull();
		act(() =>
			tab.dispatchEvent(
				pointerEvent("pointerdown", { pointerId: 4, button: 1 }),
			),
		);
		act(() =>
			tab.dispatchEvent(pointerEvent("pointerup", { pointerId: 4, button: 1 })),
		);
		expect(apiCloses).toBe(0);
	});

	it("maps product health counts into the public status summary presentation", () => {
		useHealthStore.setState({
			entries: [
				{ id: 1, ts: 1, level: "error", source: "shell", message: "broken" },
				{ id: 2, ts: 2, level: "warn", source: "engine", message: "slow" },
				{ id: 3, ts: 3, level: "error", source: "play", message: "stopped" },
				{ id: 4, ts: 4, level: "info", source: "plugin", message: "ready" },
			],
		});

		const props = tabProps(() => undefined);
		Object.assign(props.api, { id: "info" });
		const view = render(<DockTab {...props} />);
		const summary = view.container.querySelector<HTMLElement>(
			".fx-dock-tab-status-summary",
		)!;

		expect(summary.getAttribute("aria-label")).toBe("2 errors, 1 warnings");
		expect(
			Array.from(summary.querySelectorAll<HTMLElement>("[data-status-id]")).map(
				(item) => [item.dataset.statusId, item.textContent],
			),
		).toEqual([
			["errors", "✖2"],
			["warnings", "⚠1"],
		]);
	});
});
