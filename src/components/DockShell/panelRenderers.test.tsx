import { afterEach, describe, expect, test } from "bun:test";
import {
	type PanelRenderers,
	PanelRenderersProvider as SharedProvider,
	DEFAULT_PANEL_RENDERERS as sharedDefaults,
	DEFAULT_EDITOR_PANEL_IDS as sharedEditorPanelIds,
	usePanelRenderers as useSharedRenderers,
} from "@forgeax/app-shell/application";
import { cleanup, render } from "@testing-library/react";
import {
	DEFAULT_EDITOR_PANEL_IDS,
	DEFAULT_PANEL_RENDERERS,
	PanelRenderersProvider,
	usePanelRenderers,
} from "./panelRenderers";

afterEach(cleanup);

function Probe({
	read,
	capture,
}: {
	read: () => PanelRenderers;
	capture: (value: PanelRenderers) => void;
}) {
	capture(read());
	return null;
}

describe("shared panel renderer compatibility context", () => {
	test("re-exports the exact provider, hook and defaults", () => {
		expect(PanelRenderersProvider).toBe(SharedProvider);
		expect(usePanelRenderers).toBe(useSharedRenderers);
		expect(DEFAULT_PANEL_RENDERERS).toBe(sharedDefaults);
		expect(DEFAULT_EDITOR_PANEL_IDS).toBe(sharedEditorPanelIds);
	});

	test("shares updates in both directions across the package boundary", () => {
		const first: PanelRenderers = { editorPanelIds: ["first"] };
		const second: PanelRenderers = { editorPanelIds: ["second"] };
		let seen: PanelRenderers | undefined;
		const capture = (value: PanelRenderers) => {
			seen = value;
		};
		const tree = (value: PanelRenderers) => (
			<SharedProvider value={value}>
				<Probe read={usePanelRenderers} capture={capture} />
			</SharedProvider>
		);
		const view = render(tree(first));
		expect(seen).toBe(first);
		view.rerender(tree(second));
		expect(seen).toBe(second);
		view.unmount();
		render(
			<PanelRenderersProvider value={first}>
				<Probe read={useSharedRenderers} capture={capture} />
			</PanelRenderersProvider>,
		);
		expect(seen).toBe(first);
	});

	test("restores the outer provider and isolates an independent root", () => {
		const outer: PanelRenderers = { editorPanelIds: ["outer"] };
		const inner: PanelRenderers = { editorPanelIds: ["inner"] };
		let seen: PanelRenderers | undefined;
		let separate: PanelRenderers | undefined;
		const probe = (
			<Probe
				read={usePanelRenderers}
				capture={(value) => {
					seen = value;
				}}
			/>
		);
		const tree = (nested: boolean) => (
			<SharedProvider value={outer}>
				{nested ? (
					<PanelRenderersProvider value={inner}>{probe}</PanelRenderersProvider>
				) : (
					probe
				)}
			</SharedProvider>
		);
		const view = render(tree(true));
		expect(seen).toBe(inner);
		render(
			<Probe
				read={useSharedRenderers}
				capture={(value) => {
					separate = value;
				}}
			/>,
		);
		expect(separate).toBe(sharedDefaults);
		view.rerender(tree(false));
		expect(seen).toBe(outer);
		view.unmount();
		render(
			<Probe
				read={usePanelRenderers}
				capture={(value) => {
					seen = value;
				}}
			/>,
		);
		expect(seen).toBe(sharedDefaults);
	});
});
