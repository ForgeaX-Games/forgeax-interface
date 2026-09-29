// packages/interface/src/appHostBootstrap.test.ts
//
// ADR 0025 M2 integration proof: declarative `contributes` flows through the
// bootstrap wrap into the contribution registry, host.panels is a derived
// memoized snapshot, and capability-driven activation/deactivation adds AND
// removes contributions at runtime — with onPanelsChange firing for React.
import { describe, expect, it } from "bun:test";
import { createPageServices } from "@forgeax/app-shell/pages";
import { qualifyContributionId } from "@forgeax/types";
import type { SerializedDockview } from "dockview";
import type React from "react";
import { bootstrapAppHost } from "./appHostBootstrap";
import type { AppExtension } from "./core/app-shell";
import type { PageController } from "./core/page-platform/types";

const C = (() => null) as React.ComponentType;
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function rollbackFixture(owner: string, controller?: PageController) {
	const pageId = qualifyContributionId(owner, "page", "main");
	const panelId = qualifyContributionId(owner, "panel", "main");
	const contributions: NonNullable<AppExtension["contributes"]> = {
		menus: [
			{
				id: owner,
				menu: "edit",
				group: owner,
				groupOrder: 999,
				order: 10,
				label: "Rollback",
			},
		],
		panels: { overlays: { Dashboard: C } },
		panelActions: [
			{
				id: owner,
				panelId: "test-panel",
				command: "test-command",
				title: "Rollback",
			},
		],
		panelControls: [{ id: owner, render: () => null }],
		panelTypes: [
			{ id: panelId, runtime: { kind: "inline", render: () => null } },
		],
		pages: [
			{
				id: pageId,
				title: "Rollback",
				cardinality: "singleton",
				layout: { version: 1, root: { kind: "tabs", placements: ["main"] } },
				panels: [{ id: "main", panelTypeId: panelId }],
				...(controller ? { createController: () => controller } : {}),
			},
		],
	};
	const state = (runtime: Awaited<ReturnType<typeof bootstrapAppHost>>) => ({
		menu: runtime.host.menus.snapshot().some((row) => row.id === owner),
		panel: runtime.host.panels.overlays?.Dashboard === C,
		action: runtime.host.panelActions.all().some((row) => row.id === owner),
		control: runtime.host.panelControls.get(owner) !== undefined,
		page: runtime.host.pageRegistry.get(pageId) !== undefined,
	});
	return { contributions, pageId, state };
}

const noRollbackContributions = {
	menu: false,
	panel: false,
	action: false,
	control: false,
	page: false,
};
const liveRollbackContributions = {
	menu: true,
	panel: true,
	action: true,
	control: true,
	page: true,
};

describe("declarative contribution rollback", () => {
	it("resumes partial shutdown without replaying successful catalog cleanup", async () => {
		const previousFetch = globalThis.fetch;
		const previousEvents = globalThis.EventSource;
		let closed = 0;
		let blocked = true;
		let ownerDisposed = 0;
		const catalogOwner = "@forgeax-extension/shutdown-catalog";
		const catalogPage = qualifyContributionId(catalogOwner, "page", "main");
		globalThis.fetch = (async () =>
			Response.json({
				kind: null,
				count: 1,
				generation: 1,
				items: [
					{
						id: catalogOwner,
						version: "1",
						kind: "extension",
						displayName: "Catalog",
						contributes: {
							panelTypes: [
								{ id: "content", runtime: "iframe", entry: "./index.html" },
							],
							pages: [
								{
									id: "main",
									title: "Catalog",
									cardinality: "singleton",
									layout: {
										version: 2,
										root: {
											kind: "tabs",
											placements: ["content"],
											active: "content",
										},
									},
									panels: [
										{
											id: "content",
											panelType: { extension: "self", id: "content" },
										},
									],
								},
							],
						},
					},
				],
			})) as typeof fetch;
		globalThis.EventSource = class {
			addEventListener() {}
			close() {
				closed++;
			}
		} as unknown as typeof EventSource;
		let runtime: Awaited<ReturnType<typeof bootstrapAppHost>> | undefined;
		try {
			const owner = "@forgeax-plugin/shutdown-in-process";
			const fixture = rollbackFixture(owner, {
				prepareClose: () =>
					blocked ? { status: "vetoed" } : { status: "ready" },
				dispose: () => {
					ownerDisposed++;
				},
			});
			runtime = await bootstrapAppHost({
				extensions: [
					{
						id: owner,
						version: "1",
						contributes: fixture.contributions,
						async setup(ctx) {
							await ctx.host.pages.open({ typeId: fixture.pageId });
						},
					},
				],
			});
			expect(runtime.host.pageRegistry.get(catalogPage)).toBeDefined();
			await runtime.host.pages.open({ typeId: catalogPage });
			await expect(runtime.dispose()).rejects.toMatchObject({
				name: "ExtensionUnloadDeferredError",
				extensionId: owner,
			});
			expect(fixture.state(runtime)).toEqual(liveRollbackContributions);
			expect(ownerDisposed).toBe(0);
			expect(runtime.host.pageRegistry.get(catalogPage)).toBeUndefined();
			expect(closed).toBe(1);
			blocked = false;
			await runtime.dispose();
			expect(fixture.state(runtime)).toEqual(noRollbackContributions);
			expect(ownerDisposed).toBe(1);
			expect(closed).toBe(1);
			await runtime.dispose();
			expect(ownerDisposed).toBe(1);
			expect(closed).toBe(1);
		} finally {
			blocked = false;
			await runtime?.dispose();
			globalThis.fetch = previousFetch;
			globalThis.EventSource = previousEvents;
		}
	});

	it("rejects incomplete runtime disposal and later removes the retained owner exactly once", async () => {
		const owner = "@forgeax-plugin/deferred-runtime-dispose";
		let blocked = true;
		let disposed = 0;
		let imperativeCleanup = 0;
		const fixture = rollbackFixture(owner, {
			prepareClose: () =>
				blocked ? { status: "vetoed" } : { status: "ready" },
			dispose: () => {
				disposed++;
			},
		});
		const runtime = await bootstrapAppHost({
			extensions: [
				{
					id: owner,
					version: "1",
					contributes: fixture.contributions,
					async setup(ctx) {
						await ctx.host.pages.open({ typeId: fixture.pageId });
						return () => {
							imperativeCleanup++;
						};
					},
				},
			],
		});
		try {
			await expect(runtime.dispose()).rejects.toMatchObject({
				name: "ExtensionUnloadDeferredError",
				extensionId: owner,
			});
			expect(fixture.state(runtime)).toEqual(liveRollbackContributions);
			expect(imperativeCleanup).toBe(0);
			expect(disposed).toBe(0);
		} finally {
			blocked = false;
			await runtime.dispose();
		}
		expect(fixture.state(runtime)).toEqual(noRollbackContributions);
		expect(imperativeCleanup).toBe(1);
		expect(disposed).toBe(1);
	});

	it("removes every installed channel after asynchronous setup rejection", async () => {
		const owner = "@forgeax-plugin/setup-rollback";
		const fixture = rollbackFixture(owner);
		const runtime = await bootstrapAppHost({
			extensions: [
				{
					id: owner,
					version: "1",
					contributes: fixture.contributions,
					async setup() {
						await Promise.resolve();
						throw new Error("expected setup rejection");
					},
				},
			],
		});
		try {
			expect(fixture.state(runtime)).toEqual(noRollbackContributions);
		} finally {
			await runtime.dispose();
		}
	});

	it("removes earlier channels when page contribution validation fails before setup", async () => {
		const owner = "@forgeax-plugin/registration-rollback";
		const fixture = rollbackFixture(owner);
		let setupCalls = 0;
		const runtime = await bootstrapAppHost({
			extensions: [
				{
					id: owner,
					version: "1",
					contributes: { ...fixture.contributions, panelTypes: [] },
					setup() {
						setupCalls++;
					},
				},
			],
		});
		try {
			expect(setupCalls).toBe(0);
			expect(fixture.state(runtime)).toEqual(noRollbackContributions);
		} finally {
			await runtime.dispose();
		}
	});

	it("retains surrounding contributions when failed setup already opened a dirty page", async () => {
		const owner = "@forgeax-plugin/dirty-setup";
		let dirty = true;
		let disposed = 0;
		let discarded = 0;
		const fixture = rollbackFixture(owner, {
			prepareClose: () => (dirty ? { status: "dirty" } : { status: "ready" }),
			discard: () => {
				discarded++;
				dirty = false;
			},
			dispose: () => {
				disposed++;
			},
		});
		const runtime = await bootstrapAppHost({
			extensions: [
				{
					id: owner,
					version: "1",
					provides: ["failed-setup-must-not-provide"],
					contributes: fixture.contributions,
					async setup(ctx) {
						await ctx.host.pages.open({ typeId: fixture.pageId });
						throw new Error("expected dirty setup failure");
					},
				},
			],
		});
		try {
			expect(fixture.state(runtime)).toEqual(liveRollbackContributions);
			expect(runtime.host.pages.getSnapshot().instances).toHaveLength(1);
			expect(disposed).toBe(0);
			expect(discarded).toBe(0);
			expect(
				runtime.host.capabilities.has("failed-setup-must-not-provide"),
			).toBe(false);
			await expect(runtime.dispose()).rejects.toMatchObject({
				name: "ExtensionUnloadDeferredError",
				extensionId: owner,
			});
			expect(fixture.state(runtime)).toEqual(liveRollbackContributions);
			expect(disposed).toBe(0);
		} finally {
			dirty = false;
			await runtime.dispose();
		}
		expect(fixture.state(runtime)).toEqual(noRollbackContributions);
		expect(disposed).toBe(1);
		expect(discarded).toBe(0);
	});

	it("does not tear down a successful extension when page close vetoes deactivation", async () => {
		const owner = "@forgeax-plugin/veto-deactivation";
		let veto = true;
		let disposed = 0;
		let imperativeCleanup = 0;
		let setupCalls = 0;
		const fixture = rollbackFixture(owner, {
			prepareClose: () =>
				veto ? { status: "vetoed", message: "keep page" } : { status: "ready" },
			dispose: () => {
				disposed++;
			},
		});
		const runtime = await bootstrapAppHost({
			extensions: [
				{
					id: owner,
					version: "1",
					requires: ["test-veto-cap"],
					contributes: fixture.contributions,
					async setup(ctx) {
						setupCalls++;
						await ctx.host.pages.open({ typeId: fixture.pageId });
						return () => {
							imperativeCleanup++;
						};
					},
				},
			],
		});
		try {
			runtime.control.capabilities.add("test-veto-cap");
			await tick();
			await tick();
			expect(fixture.state(runtime)).toEqual(liveRollbackContributions);
			runtime.control.capabilities.remove("test-veto-cap");
			await tick();
			await tick();
			expect(fixture.state(runtime)).toEqual(liveRollbackContributions);
			expect(runtime.host.pages.getSnapshot().instances).toHaveLength(1);
			expect(disposed).toBe(0);
			expect(imperativeCleanup).toBe(0);
			runtime.control.capabilities.add("test-veto-cap");
			await tick();
			await tick();
			expect(setupCalls).toBe(1);
		} finally {
			veto = false;
			await runtime.dispose();
		}
		expect(imperativeCleanup).toBe(1);
		expect(disposed).toBe(1);
		expect(fixture.state(runtime)).toEqual(noRollbackContributions);
	});
});

describe("appHostBootstrap × contribution registry (M2)", () => {
	it("rolls back declarative panels when extension setup rejects", async () => {
		let observedDuringSetup = false;
		const r = await bootstrapAppHost({
			extensions: [
				{
					id: "test.failed-declarative-owner",
					version: "1.0.0",
					contributes: { panels: { overlays: { Dashboard: C } } },
					async setup(ctx) {
						observedDuringSetup = ctx.host.panels.overlays?.Dashboard === C;
						throw new Error("expected declarative setup rejection");
					},
				},
			],
		});
		try {
			expect(observedDuringSetup).toBe(true);
			expect(r.host.panels.overlays?.Dashboard).toBeUndefined();
		} finally {
			await r.dispose();
		}
	});

	it("contributes-only extension (no setup) lands in host.panels; dispose removes it", async () => {
		const ext: AppExtension = {
			id: "test.overlay",
			version: "1.0.0",
			contributes: { panels: { overlays: { Dashboard: C } } },
		};
		const r = await bootstrapAppHost({ extensions: [ext] });
		expect(r.host.panels.overlays?.Dashboard).toBe(C);
		await r.dispose();
		expect(r.host.panels.overlays?.Dashboard).toBeUndefined();
	});

	it("host.panels snapshot identity is stable between changes (memo by version)", async () => {
		const r = await bootstrapAppHost();
		const a = r.host.panels;
		const b = r.host.panels;
		expect(a).toBe(b);
		const off = r.control.contributePanels("test", {
			overlays: { Dashboard: C },
		});
		expect(r.host.panels).not.toBe(a);
		expect(r.host.panels.overlays?.Dashboard).toBe(C);
		off();
		await r.dispose();
	});

	it("capability-driven activate/deactivate adds and removes the contribution at runtime", async () => {
		const ext: AppExtension = {
			id: "test.gated",
			version: "1.0.0",
			requires: ["test-cap"],
			contributes: { panels: { overlays: { Settings: C } } },
		};
		const r = await bootstrapAppHost({ extensions: [ext] });
		let changes = 0;
		const unsub = r.control.onPanelsChange(() => {
			changes++;
		});

		// pending — requires unsatisfied, nothing contributed
		expect(r.host.panels.overlays?.Settings).toBeUndefined();

		// capability appears → loader activates → contributes lands + change fires
		r.control.capabilities.add("test-cap");
		await tick();
		await tick();
		expect(r.host.panels.overlays?.Settings).toBe(C);
		expect(changes).toBeGreaterThan(0);

		// capability removed → loader cleanup → contribution re-folds away
		const before = changes;
		r.control.capabilities.remove("test-cap");
		await tick();
		await tick();
		expect(r.host.panels.overlays?.Settings).toBeUndefined();
		expect(changes).toBeGreaterThan(before);

		unsub();
		await r.dispose();
	});

	it("imperative ctx.contributePanels still works and composes with contributes", async () => {
		const stripItem = {
			id: "test.chip",
			location: "statusbar.left" as const,
			item: { type: "text" as const, text: "hi" },
		};
		const ext: AppExtension = {
			id: "test.mixed",
			version: "1.0.0",
			contributes: { panels: { overlays: { Dashboard: C } } },
			setup(ctx) {
				return ctx.contributePanels({ stripItems: { "test.chip": stripItem } });
			},
		};
		const r = await bootstrapAppHost({ extensions: [ext] });
		expect(r.host.panels.overlays?.Dashboard).toBe(C);
		expect(r.host.panels.stripItems?.["test.chip"]).toBe(stripItem);
		await r.dispose();
		expect(r.host.panels.overlays?.Dashboard).toBeUndefined();
		expect(r.host.panels.stripItems?.["test.chip"]).toBeUndefined();
	});

	it("activates and unloads declarative page + panel contributions as one bundle", async () => {
		const owner = "@forgeax-plugin/bootstrap-page";
		const pageId = qualifyContributionId(owner, "page", "main");
		const panelId = qualifyContributionId(owner, "panel", "main");
		const ext: AppExtension = {
			id: owner,
			version: "1.0.0",
			contributes: {
				panelTypes: [
					{ id: panelId, runtime: { kind: "inline", render: () => null } },
				],
				pages: [
					{
						id: pageId,
						title: "Main",
						cardinality: "singleton",
						layout: {
							version: 1,
							root: { kind: "tabs", placements: ["main"] },
						},
						panels: [{ id: "main", panelTypeId: panelId }],
					},
				],
			},
		};
		const r = await bootstrapAppHost({ extensions: [ext] });
		expect(r.host.pageRegistry.get(pageId)?.status).toBe("available");
		await r.host.pages.open({ typeId: pageId });
		await r.dispose();
		expect(r.host.pageRegistry.get(pageId)).toBeUndefined();
		expect(r.host.pages.getSnapshot().instances).toHaveLength(0);
	});
});

it("uses the product page-service factory for the complete bootstrap lifetime", async () => {
	let calls = 0;
	let subscriptions = 0;
	let selected:
		| ReturnType<typeof createPageServices<SerializedDockview>>
		| undefined;
	const runtime = await bootstrapAppHost({
		createPageServices(commands) {
			calls++;
			selected = createPageServices<SerializedDockview>(commands, {
				getCurrentProject: () => "product-project",
				subscribeCurrentProject: () => {
					subscriptions++;
					return () => {
						subscriptions--;
					};
				},
			});
			return selected;
		},
	});
	expect(calls).toBe(1);
	expect(runtime.host.pages).toBe(selected?.pages);
	expect(runtime.host.pageRegistry).toBe(selected?.pageRegistry);
	expect(subscriptions).toBe(1);
	await runtime.dispose();
	expect(subscriptions).toBe(0);
});
