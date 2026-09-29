import { describe, expect, test } from "bun:test";
import {
	dispatchAction,
	registerAction,
	type UiActionDef,
} from "@forgeax/app-shell/application";
import { actionIntentPill } from "./ai-intents";

describe("Interface consumption of the public App Shell action registry", () => {
	test("product discovery reads externally registered actions from the same authority", async () => {
		const definition: UiActionDef = {
			id: "contract.application-action",
			title: "Application action contract",
			capability: "read",
			run: () => ({ status: "completed", stateDigest: "same-registry" }),
		};
		const dispose = registerAction(definition);
		const target = {
			closest: () => ({
				dataset: { fxAction: definition.id, fxTitle: "DOM fallback" },
			}),
		} as unknown as Element;

		try {
			// This is a real Interface product reader, not another import of the
			// registry: it must observe the title registered by an external consumer.
			expect(actionIntentPill(target)?.title).toBe(definition.title);
			expect(await dispatchAction(definition.id)).toEqual({
				status: "completed",
				stateDigest: "same-registry",
			});
		} finally {
			dispose();
		}

		expect(actionIntentPill(target)?.title).toBe("DOM fallback");
		expect(await dispatchAction(definition.id)).toEqual({
			status: "rejected",
			reason: `unknown action "${definition.id}" (not in the registry)`,
		});
	});
});
