import { afterEach, describe, expect, it } from "bun:test";
import { qualifyContributionId } from "@forgeax/types";
import { act, cleanup, render } from "@testing-library/react";
import { createAppHost, HostProvider } from "../../core/app-shell";
import { PageTabStrip } from "./PageTabStrip";

afterEach(() => cleanup());

function pointerEvent(
	type: string,
	init: { pointerId: number; button?: number; buttons?: number },
): PointerEvent {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		pointerId: { value: init.pointerId },
		button: { value: init.button ?? 0 },
		buttons: { value: init.buttons ?? (type === "pointerup" ? 0 : 1) },
		isPrimary: { value: true },
	});
	return event as PointerEvent;
}

describe("PageTabStrip pointer reorder lifecycle", () => {
	it("installs, disposes, and reinstalls across zero and nonzero tab transitions", async () => {
		const owner = "@forgeax-plugin/page-tab-strip-test";
		const panelId = qualifyContributionId(owner, "panel", "main");
		const firstType = qualifyContributionId(owner, "page", "first");
		const secondType = qualifyContributionId(owner, "page", "second");
		const { host, control } = createAppHost();
		control.contributePagePlatform(owner, {
			panelTypes: [
				{ id: panelId, runtime: { kind: "inline", render: () => null } },
			],
			pageTypes: [firstType, secondType].map((id) => ({
				id,
				title: id === firstType ? "First" : "Second",
				cardinality: "singleton" as const,
				layout: {
					version: 1,
					root: { kind: "tabs" as const, placements: ["main"] },
				},
				panels: [{ id: "main", panelTypeId: panelId }],
			})),
		});

		const view = render(
			<HostProvider value={host}>
				<PageTabStrip />
			</HostProvider>,
		);
		expect(view.container.querySelector(".page-tab-list")).toBeNull();

		const dragOnce = async (pointerId: number): Promise<void> => {
			await act(async () => {
				await host.pages.open({ typeId: firstType });
				await host.pages.open({ typeId: secondType });
			});
			const tabs = [
				...view.container.querySelectorAll<HTMLElement>("[data-page-key]"),
			];
			expect(tabs).toHaveLength(2);
			act(() => {
				tabs[0]?.dispatchEvent(pointerEvent("pointerdown", { pointerId }));
				tabs[1]?.dispatchEvent(pointerEvent("pointermove", { pointerId }));
			});
			expect(tabs[0]?.classList.contains("is-drag")).toBe(true);
			act(() => window.dispatchEvent(pointerEvent("pointerup", { pointerId })));
			expect(tabs[0]?.classList.contains("is-drag")).toBe(false);
		};

		await dragOnce(1);
		await act(async () => {
			for (const page of [...host.pages.getSnapshot().instances]) {
				await host.pages.close(page.encodedKey);
			}
		});
		expect(view.container.querySelector(".page-tab-list")).toBeNull();
		await dragOnce(2);
		await act(async () => control.dispose());
	});
});
