// packages/interface/src/core/app-shell/host.test.ts
import { describe, expect, it } from "bun:test";
import { qualifyContributionId } from "@forgeax/types";
import { openPageType } from "../page-navigation";
import { PagePlatformError } from "../page-platform/types";
import { createAppHost } from "./host";

describe("createAppHost", () => {
	it("does not classify ordinary preparation or teardown failures by page error code", async () => {
		for (const phase of ["prepare", "dispose"]) {
			const owner = `@forgeax-plugin/host-error-${phase}`;
			const pageId = qualifyContributionId(owner, "page", "workspace");
			const panelId = qualifyContributionId(owner, "panel", "main");
			const error = new PagePlatformError(
				"PAGE_CLOSE_VETOED",
				"ordinary failure",
			);
			let fail = true;
			const { host, control } = createAppHost();
			const cleanup = control.contributePagePlatform(owner, {
				panelTypes: [
					{ id: panelId, runtime: { kind: "inline", render: () => null } },
				],
				pageTypes: [
					{
						id: pageId,
						title: "Workspace",
						cardinality: "singleton",
						layout: {
							version: 1,
							root: { kind: "tabs", placements: ["main"] },
						},
						panels: [{ id: "main", panelTypeId: panelId }],
						createController: () => ({
							prepareClose: () => {
								if (fail && phase === "prepare") throw error;
								return { status: "ready" };
							},
							dispose: () => {
								if (fail && phase === "dispose") throw error;
							},
						}),
					},
				],
			});
			await host.pages.open({ typeId: pageId });
			try {
				await expect(Promise.resolve().then(cleanup)).rejects.toBe(error);
			} finally {
				fail = false;
				await cleanup();
				await control.dispose();
			}
		}
	});

	it("keeps page navigation installed after a deferred host dispose", async () => {
		const owner = "@forgeax-plugin/host-dispose";
		const pageId = qualifyContributionId(owner, "page", "workspace");
		const panelId = qualifyContributionId(owner, "panel", "main");
		let blocked = true;
		const { host, control } = createAppHost();
		control.contributePagePlatform(owner, {
			panelTypes: [
				{ id: panelId, runtime: { kind: "inline", render: () => null } },
			],
			pageTypes: [
				{
					id: pageId,
					title: "Workspace",
					cardinality: "singleton",
					layout: { version: 1, root: { kind: "tabs", placements: ["main"] } },
					panels: [{ id: "main", panelTypeId: panelId }],
					createController: () => ({
						prepareClose: () =>
							blocked ? { status: "vetoed" } : { status: "ready" },
						dispose: () => undefined,
					}),
				},
			],
		});
		await host.pages.open({ typeId: pageId });
		try {
			await expect(control.dispose()).rejects.toMatchObject({
				code: "PAGE_CLOSE_VETOED",
			});
			await openPageType(pageId);
			expect(host.pages.getSnapshot().instances).toHaveLength(1);
		} finally {
			blocked = false;
			await control.dispose();
		}
		await expect(openPageType(pageId)).rejects.toThrow(
			"Page host is not ready",
		);
	});

	it("has base capabilities present", () => {
		const { host } = createAppHost();
		expect(host.capabilities.has("commands")).toBe(true);
		expect(host.capabilities.has("keybindings")).toBe(true);
		expect(host.capabilities.has("bus")).toBe(true);
		expect(host.capabilities.has("storage")).toBe(true);
		expect(host.capabilities.has("panels")).toBe(true);
		expect(host.capabilities.has("contextKeys")).toBe(true);
		expect(host.capabilities.has("pages")).toBe(true);
		expect(host.capabilities.has("activities")).toBe(true);
		expect(host.capabilities.has("resourceEditors")).toBe(true);
	});

	it("publishes page and panel types as one extension-owned bundle", async () => {
		const owner = "@forgeax-plugin/host-test";
		const pageId = qualifyContributionId(owner, "page", "workspace");
		const panelId = qualifyContributionId(owner, "panel", "main");
		const { host, control } = createAppHost();
		const cleanup = control.contributePagePlatform(owner, {
			panelTypes: [
				{ id: panelId, runtime: { kind: "inline", render: () => null } },
			],
			pageTypes: [
				{
					id: pageId,
					title: "Workspace",
					cardinality: "singleton",
					layout: { version: 1, root: { kind: "tabs", placements: ["main"] } },
					panels: [{ id: "main", panelTypeId: panelId }],
				},
			],
		});

		expect(host.pageRegistry.get(pageId)?.status).toBe("available");
		await host.pages.open({ typeId: pageId });
		expect(host.pages.getSnapshot().instances).toHaveLength(1);
		await cleanup();
		expect(host.pages.getSnapshot().instances).toHaveLength(0);
		expect(host.pageRegistry.get(pageId)).toBeUndefined();
		await control.dispose();
	});

	it("extend() outside a plugin setup throws", () => {
		const { host } = createAppHost();
		expect(() => host.extend("foo", {})).toThrow(/outside plugin setup/);
	});

	it("extend() inside beginSetup succeeds and adds the capability", () => {
		const { host, control } = createAppHost();
		const manifest = {
			id: "p1",
			version: "1",
			provides: ["foo"] as const,
			setup: () => {},
		};
		control.beginSetup(manifest as any);
		host.extend("foo", { hello: "world" });
		control.endSetup();
		expect((host as any).foo).toEqual({ hello: "world" });
		expect(host.capabilities.has("foo")).toBe(true);
	});

	it("removeExtensionsByOwner reverses extends of a given owner", () => {
		const { host, control } = createAppHost();
		const m = {
			id: "p1",
			version: "1",
			provides: ["a", "b"] as const,
			setup: () => {},
		};
		control.beginSetup(m as any);
		host.extend("a", 1);
		host.extend("b", 2);
		control.endSetup();
		expect(host.capabilities.has("a")).toBe(true);
		control.removeExtensionsByOwner("p1");
		expect(host.capabilities.has("a")).toBe(false);
		expect(host.capabilities.has("b")).toBe(false);
	});
});
