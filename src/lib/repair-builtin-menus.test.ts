import { expect, test } from "bun:test";
import { createApplicationMenuRegistry } from "@forgeax/app-shell/application";
import { builtinMenusExtension } from "../core/extensions/builtin-menus";

test("bootstrap populates its host before readers render; disposal leaves no phantom menus", () => {
	const menus = createApplicationMenuRegistry();
	expect(menus.snapshot("file")).toHaveLength(0);
	const cleanup = builtinMenusExtension.setup?.({ host: { menus } } as never);
	expect(menus.snapshot("file").length).toBeGreaterThan(0);
	if (typeof cleanup === "function") cleanup();
	expect(menus.snapshot("file")).toHaveLength(0);
});

test("re-registration survives stale cleanup without render-time registry repair", () => {
	const menus = createApplicationMenuRegistry();
	const first = builtinMenusExtension.setup?.({ host: { menus } } as never);
	const before = menus.snapshot("file").map((item) => item.id);
	const second = builtinMenusExtension.setup?.({ host: { menus } } as never);
	if (typeof first === "function") first();
	expect(menus.snapshot("file").map((item) => item.id)).toEqual(before);
	if (typeof second === "function") second();
	expect(menus.snapshot()).toEqual([]);
});
