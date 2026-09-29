import {
	type ApplicationMenuItem,
	serializeApplicationNativeMenus,
} from "@forgeax/app-shell/application";
import type { MenuId, NativeMenu } from "./menu-registry";

/** Product menu locations; contributions and their lifetime belong to the host. */
export const MENU_IDS: readonly MenuId[] = [
	"brand",
	"file",
	"edit",
	"window",
	"build",
	"select",
	"help",
	"publish",
];

export function projectApplicationMenus(
	items: readonly ApplicationMenuItem[],
): Record<MenuId, readonly ApplicationMenuItem[]> {
	const result: Record<MenuId, readonly ApplicationMenuItem[]> = {
		brand: [],
		file: [],
		edit: [],
		window: [],
		build: [],
		select: [],
		help: [],
		publish: [],
	};
	for (const menu of MENU_IDS)
		result[menu] = items.filter((item) => item.menu === menu);
	return result;
}

/** Compatibility shape without native platform titles. */
export function serializeApplicationMenusForNative(
	items: readonly ApplicationMenuItem[],
): NativeMenu[] {
	return serializeApplicationNativeMenus(items, MENU_IDS, (menu) => menu).map(
		({ menu, items }) => ({ menu, items }),
	);
}
