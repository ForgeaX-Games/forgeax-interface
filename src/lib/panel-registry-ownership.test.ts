import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createPanelActionRegistry } from "../core/panels/panel-action-registry";
import { createPanelControlRegistry } from "../core/panels/panel-control-registry";
import type { PanelActionContribution } from "../core/panels/types";
import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

test("panel registry mechanics belong to App Shell, not Interface", () => {
	for (const kind of ["action", "control"]) {
		const source = normalizeSourceStringDelimiters(
			readFileSync(
				new URL(`../core/panels/panel-${kind}-registry.ts`, import.meta.url),
				"utf8",
			),
		);
		expect(source).toContain("from '@forgeax/app-shell/application'");
		expect(source).not.toContain("queueMicrotask");
		expect(source).not.toContain("entries.push");
		expect(source).not.toContain("listeners = new Set");
	}
});

test("delegation retains product action types and immediate state with deferred notifications", async () => {
	const registry = createPanelActionRegistry();
	const action: PanelActionContribution = {
		kind: "menu",
		id: "product-menu",
		panelId: "panel",
		title: "Menu",
		items: [],
		labelContextKey: "product.label",
		itemsContextKey: "product.items",
	};
	let notifications = 0;
	registry.onChange(() => notifications++);
	const remove = registry.contribute("product", [action]);
	const resolved = registry.list("panel")[0];
	expect(resolved).toBe(action);
	if (resolved.kind === "menu") expect(resolved.items).toEqual([]);
	expect(notifications).toBe(0);
	await Promise.resolve();
	expect(notifications).toBe(1);
	remove();
	remove();
	expect(registry.all()).toEqual([]);
	await Promise.resolve();
	expect(registry.version()).toBe(2);
});

test("delegation retains control render and batch identities", async () => {
	const registry = createPanelControlRegistry();
	const first = { id: "control", render: () => null };
	const second = { id: "control", render: () => "second" };
	const remove = registry.contribute("product", [first]);
	registry.contribute("product", [second]);
	expect(registry.get("control")).toBe(first);
	remove();
	expect(registry.get("control")).toBe(second);
	await Promise.resolve();
	expect(registry.version()).toBe(1);
});
