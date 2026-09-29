import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(
	readFileSync(resolve(packageRoot, "package.json"), "utf8"),
) as {
	exports: Record<
		string,
		string | { types?: string; browser?: string; import?: string }
	>;
};

function exportTargets(
	target: string | { types?: string; browser?: string; import?: string },
): string[] {
	return typeof target === "string"
		? [target]
		: (Object.values(target).filter(Boolean) as string[]);
}

function hasSourceForBuiltTarget(target: string): boolean {
	if (target === "./package.json") return true;
	const packageTarget = target.replace(/^\.\/dist\/package\//, "");
	if (packageTarget === target) return false;
	const relativeTarget = packageTarget.replace(/^(?:node|browser)\//, "src/");
	const extension = relativeTarget.endsWith(".d.ts")
		? ".d.ts"
		: extname(relativeTarget);
	const sourceBase = resolve(
		packageRoot,
		relativeTarget.slice(0, -extension.length),
	);
	return [".ts", ".tsx", ".css", ".json", ".png", ".svg"].some(
		(sourceExtension) => existsSync(`${sourceBase}${sourceExtension}`),
	);
}

describe("package exports", () => {
	it("points every concrete export at a build output backed by repository source", () => {
		const missing = Object.entries(packageJson.exports)
			.flatMap(([specifier, target]) =>
				exportTargets(target).map((path) => [specifier, path] as const),
			)
			.filter(([, target]) => !target.includes("*"))
			.filter(([, target]) => !hasSourceForBuiltTarget(target))
			.map(([specifier, target]) => `${specifier} -> ${target}`);

		expect(missing).toEqual([]);
	});

	it("exposes the shared panel and status-popover facade", () => {
		expect(packageJson.exports["./core/panels"]).toEqual({
			types: "./dist/package/browser/core/panels/index.d.ts",
			browser: "./dist/package/browser/core/panels/index.js",
			import: "./dist/package/node/core/panels/index.js",
		});
		expect(packageJson.exports["./*"]).toEqual({
			types: "./dist/package/browser/*.d.ts",
			browser: "./dist/package/browser/*.js",
			import: "./dist/package/node/*.js",
		});
		expect(
			existsSync(
				resolve(packageRoot, "src/components/StatusBar/StripPopover.tsx"),
			),
		).toBe(true);
		expect(
			packageJson.exports["./components/StatusBar/VersionBadge"],
		).toBeUndefined();
	});

	it("does not expose Files application state from the reusable foundation", () => {
		expect(packageJson.exports["./lib/resource-preview"]).toBeUndefined();
		expect(
			existsSync(resolve(packageRoot, "src/lib/resource-preview.ts")),
		).toBe(false);
	});

	it("does not expose the Chat-owned model label hook", () => {
		expect(packageJson.exports["./lib/model"]).toBeUndefined();
		expect(existsSync(resolve(packageRoot, "src/lib/model.ts"))).toBe(false);
	});

	it("does not expose the Chat-owned provider badge", () => {
		expect(packageJson.exports["./lib/provider-badge"]).toBeUndefined();
		expect(existsSync(resolve(packageRoot, "src/lib/provider-badge.ts"))).toBe(
			false,
		);
		expect(
			existsSync(resolve(packageRoot, "src/lib/provider-badge.test.ts")),
		).toBe(false);
	});
});
