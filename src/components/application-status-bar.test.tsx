import "../lib/telemetry-test-prelude";
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { ApplicationShell } from "../ApplicationShell";
import { BrandProvider } from "../brand";
import { createAppHost, HostProvider, useHost } from "../core/app-shell";
import { usePanelRenderers } from "./DockShell/panelRenderers";

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
	await act(async () => {
		cleanup();
	});
	for (const dispose of disposers.splice(0)) await dispose();
});

test("the application shell observes, retains and revokes the product status bar", async () => {
	const { host, control } = createAppHost();
	disposers.push(() => control.dispose());
	const runtime = { host, control, dispose: () => control.dispose() };
	let mounts = 0;
	let unmounts = 0;
	function ProductStatusBar() {
		expect(useHost()).toBe(host);
		expect(usePanelRenderers()).toBe(host.panels);
		useEffect(() => {
			mounts++;
			return () => {
				unmounts++;
			};
		}, []);
		return (
			<div role="status" aria-label="product status">
				Product footer
			</div>
		);
	}
	const NoRouter = () => null;
	let view: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<BrandProvider>
				<HostProvider value={host}>
					<ApplicationShell
						runtime={runtime}
						onboarding={{ enabled: false }}
						KeyboardRouter={NoRouter}
						NativeMenuBridge={NoRouter}
					/>
				</HostProvider>
			</BrandProvider>,
		);
	});
	expect(
		view!.getByRole("status", { name: "forgeax status bar" }),
	).toBeTruthy();
	let revoke = () => {};
	await act(async () => {
		revoke = control.contributePanels("product-footer", {
			slots: { StatusBar: ProductStatusBar },
		});
	});
	expect(view!.getByRole("status", { name: "product status" })).toBeTruthy();
	expect(
		view!.queryByRole("status", { name: "forgeax status bar" }),
	).toBeNull();
	expect(mounts).toBe(1);
	let revokeOther = () => {};
	await act(async () => {
		revokeOther = control.contributePanels("unrelated", {
			editorPanelIds: ["probe"],
		});
	});
	expect(mounts).toBe(1);
	expect(unmounts).toBe(0);
	await act(async () => {
		revokeOther();
		revoke();
	});
	expect(
		view!.getByRole("status", { name: "forgeax status bar" }),
	).toBeTruthy();
	expect(view!.queryByRole("status", { name: "product status" })).toBeNull();
	expect(unmounts).toBe(1);
});
