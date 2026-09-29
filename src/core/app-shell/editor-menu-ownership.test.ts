import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

test("Interface locales do not retain labels owned by Editor menu contributions", () => {
	const owned: Record<string, string[]> = {
		file: ["save"],
		edit: ["undo", "redo", "delete"],
		window: ["outline", "inspector", "files"],
		build: ["play", "stop", "editScene", "reload"],
		select: [
			"all",
			"none",
			"invert",
			"byType",
			"byType.mesh",
			"byType.light",
			"byType.camera",
			"byType.collider",
			"marquee",
			"frame",
		],
	};
	for (const locale of ["en", "zh"]) {
		const { menu } = JSON.parse(
			readFileSync(
				new URL(`../../i18n/locales/${locale}.json`, import.meta.url),
				"utf8",
			),
		);
		for (const [section, keys] of Object.entries(owned)) {
			for (const key of keys) expect(menu[section]?.[key]).toBeUndefined();
		}
		expect(menu.file.saveAll).toBeTruthy();
		expect(menu.edit.copy).toBeTruthy();
		expect(menu.window.viewport).toBeTruthy();
		expect(menu.build.export).toBeTruthy();
	}
});

test("Interface builtins do not declare Editor commands or Editor panel identity", () => {
	const source = normalizeSourceStringDelimiters(
		readFileSync(
			new URL("../extensions/builtin-menus.ts", import.meta.url),
			"utf8",
		),
	);
	expect(source).not.toMatch(/commandId:\s*['"]editor\./);
	for (const id of [
		"build.reload",
		"select.invert",
		"select.byType",
		"select.byType.mesh",
		"select.byType.light",
		"select.byType.camera",
		"select.byType.collider",
		"select.marquee",
	]) {
		expect(source).not.toMatch(
			new RegExp(`\\bid\\s*:\\s*'${id.replaceAll(".", "\\.")}'`),
		);
	}
	expect(source).not.toMatch(/['"]ep:(hierarchy|inspector|assets)['"]/);
	expect(source).toMatch(/\bcommandId\s*:\s*'text\.copy'/);
	expect(source).toMatch(/\bcommandId\s*:\s*'game\.new'/);
	expect(source).toMatch(/\bid\s*:\s*'window\.viewport'/);
});
