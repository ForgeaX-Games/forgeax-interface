import { expect, test } from "bun:test";
import { qualifyContributionId } from "@forgeax/types";
import {
	createInterfaceApplicationOwner,
	startInterfaceApplication,
} from "../application";

test("startup failure hands retained dirty cleanup to the durable application owner", async () => {
	const previous = (window as unknown as { __forgeaxBoot?: unknown })
		.__forgeaxBoot;
	const startupError = new Error("boot presentation failed");
	(window as unknown as { __forgeaxBoot: unknown }).__forgeaxBoot = {
		progress() {
			throw startupError;
		},
	};
	let blocked = true;
	let retired = 0;
	const id = "@forgeax-plugin/startup-cleanup-owner";
	const page = qualifyContributionId(id, "page", "main");
	const panel = qualifyContributionId(id, "panel", "main");
	const owner = createInterfaceApplicationOwner();
	const lease = owner.acquire(() =>
		startInterfaceApplication({
			extensions: [
				{
					id,
					version: "1",
					contributes: {
						panelTypes: [
							{ id: panel, runtime: { kind: "inline", render: () => null } },
						],
						pages: [
							{
								id: page,
								title: "Pending",
								cardinality: "singleton",
								layout: {
									version: 1,
									root: { kind: "tabs", placements: ["main"] },
								},
								panels: [{ id: "main", panelTypeId: panel }],
								createController: () => ({
									prepareClose: () =>
										blocked ? { status: "vetoed" } : { status: "ready" },
									dispose: () => {
										retired++;
									},
								}),
							},
						],
					},
					async setup(ctx) {
						await ctx.host.pages.open({ typeId: page });
					},
				},
			],
		}),
	);
	try {
		await expect(lease.ready).rejects.toBe(startupError);
		expect(owner.getSnapshot()).toMatchObject({
			status: "blocked",
			retryable: true,
		});
		expect(retired).toBe(0);
		blocked = false;
		await owner.retryShutdown();
		expect(retired).toBe(1);
		expect(owner.getSnapshot()).toEqual({ status: "ready" });
	} finally {
		blocked = false;
		lease.release();
		await owner.retryShutdown();
		(window as unknown as { __forgeaxBoot?: unknown }).__forgeaxBoot = previous;
	}
});
