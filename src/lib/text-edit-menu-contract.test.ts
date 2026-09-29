import { beforeEach, describe, expect, test } from "bun:test";
import { builtinCommandsExtension } from "../core/extensions/builtin-commands";
import { builtinMenusExtension } from "../core/extensions/builtin-menus";
import {
	__resetMenuRegistryForTest,
	getTestMenus,
	serializeMenusForNative,
	snapshotMenu,
} from "./menu-registry.test-utils";

beforeEach(() => {
	__resetMenuRegistryForTest();
	document.body.replaceChildren();
});

describe("text editing menu contract", () => {
	test("publishes enabled cut, copy and paste commands to web and native menus", () => {
		const cleanup = builtinMenusExtension.setup?.({
			host: { menus: getTestMenus() },
		} as never);
		const editItems = snapshotMenu("edit");

		expect(editItems.find((item) => item.id === "edit.cut")?.commandId).toBe(
			"text.cut",
		);
		expect(editItems.find((item) => item.id === "edit.copy")?.commandId).toBe(
			"text.copy",
		);
		expect(editItems.find((item) => item.id === "edit.paste")?.commandId).toBe(
			"text.paste",
		);

		const nativeEdit = serializeMenusForNative((key) => key).find(
			(menu) => menu.menu === "edit",
		);
		expect(
			nativeEdit?.items.find((item) => item.id === "edit.cut")?.enabled,
		).toBe(true);
		expect(
			nativeEdit?.items.find((item) => item.id === "edit.copy")?.enabled,
		).toBe(true);
		expect(
			nativeEdit?.items.find((item) => item.id === "edit.paste")?.enabled,
		).toBe(true);
		if (typeof cleanup === "function") cleanup();
	});

	test("registers the commands referenced by the text edit menu", () => {
		const commands = new Set<string>();
		const cleanup = builtinCommandsExtension.setup?.({
			registerCommand(command: { id: string }) {
				commands.add(command.id);
				return () => commands.delete(command.id);
			},
		} as never);

		expect(commands).toContain("text.cut");
		expect(commands).toContain("text.copy");
		expect(commands).toContain("text.paste");
		expect(commands).toContain("text.selectAll");
		if (typeof cleanup === "function") cleanup();
	});

	test("text.selectAll selects focused input text and reports completed", async () => {
		const commands = new Map<string, { execute: () => unknown }>();
		const cleanup = builtinCommandsExtension.setup?.({
			registerCommand(command: { id: string; execute: () => unknown }) {
				commands.set(command.id, command);
				return () => commands.delete(command.id);
			},
			host: { keybindings: { register: () => () => undefined } },
			bus: { emit: () => undefined },
		} as never);
		const input = document.createElement("input");
		input.value = "api-key";
		document.body.append(input);
		input.focus();
		input.setSelectionRange(3, 3);

		const result = await commands.get("text.selectAll")?.execute();

		expect(result).toEqual({ status: "completed" });
		expect(input.selectionStart).toBe(0);
		expect(input.selectionEnd).toBe(input.value.length);
		if (typeof cleanup === "function") cleanup();
	});

	test("text.selectAll rejects outside text inputs for the caller to handle", async () => {
		const commands = new Map<string, { execute: () => unknown }>();
		const cleanup = builtinCommandsExtension.setup?.({
			registerCommand(command: { id: string; execute: () => unknown }) {
				commands.set(command.id, command);
				return () => commands.delete(command.id);
			},
			host: { keybindings: { register: () => () => undefined } },
			bus: { emit: () => undefined },
		} as never);
		const button = document.createElement("button");
		document.body.append(button);
		button.focus();

		const result = await commands.get("text.selectAll")?.execute();

		expect(result).toEqual({ status: "rejected" });
		if (typeof cleanup === "function") cleanup();
	});
});
