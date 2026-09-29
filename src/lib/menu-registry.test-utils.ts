// Test data adapter only. Production readers receive their host registry.
import {
	type ApplicationMenuItem,
	createApplicationMenuRegistry,
} from "@forgeax/app-shell/application";
import {
	projectApplicationMenus,
	serializeApplicationMenusForNative,
} from "./application-menu-projection";
import type { MenuId, MenuItemDef } from "./menu-registry";

export type { MenuItemDef } from "./menu-registry";

let menus = createApplicationMenuRegistry();
let translate = (key: string): string => key;
export const getTestMenus = () => menus;
export const setTestMenuTranslator = (next: (key: string) => string) => {
	translate = next;
};
function contribution(def: MenuItemDef): ApplicationMenuItem {
	return {
		...def,
		groupOrder: 0,
		get label() {
			return translate(def.labelKey);
		},
		children: def.children?.map(contribution),
		dynamicChildren: def.dynamicChildren
			? () => def.dynamicChildren!().map(contribution)
			: undefined,
	};
}
export const registerMenuItem = (def: MenuItemDef) =>
	menus.register(contribution(def));
export const onMenuChange = (listener: () => void) => menus.subscribe(listener);
export const snapshotMenu = (menu: MenuId) =>
	menus.snapshot(menu) as unknown as MenuItemDef[];
export const snapshotAllMenus = () => projectApplicationMenus(menus.snapshot());
export function serializeMenusForNative(t: (key: string) => string) {
	translate = t;
	return serializeApplicationMenusForNative(menus.snapshot());
}
export function __resetMenuRegistryForTest() {
	menus.dispose();
	menus = createApplicationMenuRegistry();
	translate = (key) => key;
}
