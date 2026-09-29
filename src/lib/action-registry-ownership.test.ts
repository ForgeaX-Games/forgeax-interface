import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const sourceRoot = resolve(import.meta.dir, "..");
const sharedOwner = "@forgeax/app-shell/application";
const consumers: Record<string, string[]> = {
	"components/CommandPalette/CommandPalette.tsx": [
		"snapshotActions",
		"dispatchAction",
		"getAction",
	],
	"core/extensions/trajectory.ts": ["registerAction", "registerStateSlice"],
	"lib/builtin-actions.ts": ["registerAction", "registerStateSlice"],
	"lib/action-dom-discovery.ts": ["registerAction", "UiCapability"],
	"lib/vag-action-bridge.ts": [
		"registerAction",
		"UiActionResult",
		"UiCapability",
	],
	"lib/ui-action-bridge-compatibility.ts": [
		"dispatchAction",
		"snapshotActions",
		"snapshotState",
		"buildManifest",
		"onRegistryChange",
	],
	"lib/ui-trajectory.ts": ["getAction", "UI_ACTION_DISPATCH_EVENT"],
	"lib/ui-action-highlight.ts": ["getAction", "UI_ACTION_DISPATCH_EVENT"],
	"lib/ai-intents.ts": ["getAction"],
};

function parse(relativePath: string) {
	return ts.createSourceFile(
		relativePath,
		readFileSync(resolve(sourceRoot, relativePath), "utf8"),
		ts.ScriptTarget.Latest,
		true,
		relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
}

describe("shared action registry ownership", () => {
	test("removes the Interface implementation rather than adding a forwarding facade", () => {
		expect(existsSync(resolve(sourceRoot, "lib/action-registry.ts"))).toBe(
			false,
		);
	});

	for (const [consumer, symbols] of Object.entries(consumers)) {
		test(`${consumer} directly consumes the one App Shell registry`, () => {
			const imports = parse(consumer).statements.filter(ts.isImportDeclaration);
			const sharedSymbols = imports.flatMap((statement) => {
				if (
					!ts.isStringLiteral(statement.moduleSpecifier) ||
					statement.moduleSpecifier.text !== sharedOwner
				)
					return [];
				const bindings = statement.importClause?.namedBindings;
				return bindings && ts.isNamedImports(bindings)
					? bindings.elements.map(
							(item) => item.propertyName?.text ?? item.name.text,
						)
					: [];
			});
			for (const symbol of symbols) expect(sharedSymbols).toContain(symbol);
			expect(
				imports.some(
					(statement) =>
						ts.isStringLiteral(statement.moduleSpecifier) &&
						/(?:^|\/)action-registry$/.test(statement.moduleSpecifier.text),
				),
			).toBe(false);
		});
	}

	test("retires the migrated application exports instead of retaining aliases", () => {
		const migrated = new Set([
			"registerAction",
			"dispatchAction",
			"JsonSchemaObject",
			"UiActionDef",
			"UiActionResult",
			"UiCapability",
		]);
		for (const statement of parse("application.ts").statements) {
			if (!ts.isExportDeclaration(statement)) continue;
			if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
				for (const item of statement.exportClause.elements)
					expect(migrated.has(item.name.text)).toBe(false);
			} else {
				// A wildcard forwarding export would restore the retired public facade.
				expect(statement.moduleSpecifier?.getText()).not.toContain(
					"action-registry",
				);
				expect(statement.moduleSpecifier?.getText()).not.toContain(sharedOwner);
			}
		}
	});
});
