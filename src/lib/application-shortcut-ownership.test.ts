import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

const source = (path: string) =>
	normalizeSourceStringDelimiters(
		readFileSync(new URL(path, import.meta.url), "utf8"),
	);

describe("application shortcut ownership", () => {
	test("startup supplies product shortcuts to the existing sole keyboard router", () => {
		expect(source("../application.ts")).toContain("createShellShortcuts");
		expect(source("../ApplicationShell.tsx")).toContain(
			"runtime.shellShortcuts",
		);
	});

	test("host delegates the published registry and balances its lifetime", async () => {
		const host = source("../core/app-shell/host.ts");
		expect(host).toContain("createApplicationHost");
		expect(host).toContain("from '@forgeax/app-shell/application'");
		const { createAppHost } = await import("../core/app-shell/host");
		const runtime = createAppHost();
		let called = false;
		runtime.host.shortcuts.register({
			combo: "Ctrl+K",
			label: "Test",
			group: "test",
			match: () => true,
			run: () => {
				called = true;
			},
		});
		const retained = runtime.host.shortcuts.snapshot();
		expect(retained).toHaveLength(1);
		await runtime.control.dispose();
		expect(runtime.host.shortcuts.snapshot()).toHaveLength(0);
		retained[0]?.run({} as KeyboardEvent);
		expect(called).toBe(false);
	});

	test("router reads live contributions without owning Editor policy or callbacks", () => {
		const router = source("./global-shortcuts.ts");
		expect(router).toContain("contributions?.snapshot()");
		for (const retired of [
			"KeyboardRouterDeps",
			"routerDeps",
			"editShortcuts",
			"handleViewportKeyDown",
			"isPlayMode",
			"duplicateEntities",
		]) {
			expect(router).not.toContain(retired);
		}
		expect(source("../ApplicationShell.tsx")).toContain(
			"runtime.shellShortcuts",
		);
	});

	test("Interface no longer exports or bootstraps Editor keyboard ownership", () => {
		expect(source("../application.ts")).not.toContain(
			"configureInterfaceKeyboardRouter",
		);
		expect(source("../application.ts")).not.toContain("KeyboardRouterDeps");
		expect(source("../appHostBootstrap.ts")).not.toContain(
			"editorCommandsExtension",
		);
		expect(
			existsSync(
				new URL("../core/extensions/editor-commands.ts", import.meta.url),
			),
		).toBe(false);
	});

	test("focused text select-all stays with the existing text-edit command owner", () => {
		expect(source("../core/extensions/builtin-commands.ts")).toMatch(
			/\bregisterTextEditCommand\s*\(\s*'text\.selectAll'/,
		);
	});
});
