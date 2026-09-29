import { expect, test } from "bun:test";
import { bootstrapAppHost } from "../../appHostBootstrap";
import { createAppHost } from "./host";

const row = {
	id: "owner.save",
	menu: "file",
	group: "document",
	groupOrder: 20,
	order: 10,
	label: "Save",
};

test("each host owns a disposable menu registry rather than a module singleton", async () => {
	const first = createAppHost();
	const second = createAppHost();
	expect(first.host.capabilities.has("menus")).toBe(true);
	first.host.menus.register(row);
	expect(first.host.menus.snapshot("file")).toEqual([row]);
	expect(second.host.menus.snapshot("file")).toEqual([]);
	await first.control.dispose();
	expect(first.host.menus.snapshot()).toEqual([]);
	await second.control.dispose();
});

test("declarative menu contributions unload with their extension", async () => {
	const runtime = await bootstrapAppHost({
		extensions: [
			{
				id: "test.menu-owner",
				version: "1",
				contributes: { menus: [row] },
			},
		],
	});
	expect(runtime.host.menus.snapshot("file")).toContain(row);
	await runtime.dispose();
	expect(runtime.host.menus.snapshot()).toEqual([]);
});

test("failed setup rolls back its declarative menu contribution", async () => {
	const runtime = await bootstrapAppHost({
		extensions: [
			{
				id: "test.menu-failure",
				version: "1",
				contributes: { menus: [row] },
				setup() {
					throw new Error("expected setup failure");
				},
			},
		],
	});
	expect(runtime.host.menus.snapshot("file")).not.toContain(row);
	await runtime.dispose();
});
