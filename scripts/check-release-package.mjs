import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, "dist", "package");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? root,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`,
		);
	}
	return result.stdout.trim();
}

for (const required of [
	"browser/index.js",
	"browser/index.d.ts",
	"browser/application.js",
	"browser/application.d.ts",
	"browser/ApplicationShell.js",
	"browser/ApplicationShell.d.ts",
	"node/application.js",
	"node/ApplicationShell.js",
	"browser/styles/global.css",
	"browser/assets/icons/agent-icon.png",
	"packages/design/styles/fx-bridge.css",
]) {
	if (!existsSync(join(outputRoot, required)))
		throw new Error(`missing release output: ${required}`);
}

const aliasLeaks = walk(outputRoot)
	.filter((path) => path.endsWith(".js") || path.endsWith(".d.ts"))
	.filter(
		(path) =>
			readFileSync(path, "utf8").includes("'@/") ||
			readFileSync(path, "utf8").includes('"@/'),
	);
if (aliasLeaks.length > 0)
	throw new Error(
		`release output contains source aliases:\n${aliasLeaks.join("\n")}`,
	);

const scratch = mkdtempSync(join(tmpdir(), "forgeax-interface-pack-"));
try {
	const packed = JSON.parse(
		run("npm", [
			"pack",
			"--ignore-scripts",
			"--json",
			"--pack-destination",
			scratch,
		]),
	);
	const files = new Set(packed[0]?.files?.map((entry) => entry.path) ?? []);
	for (const required of [
		"package.json",
		"dist/package/browser/index.js",
		"dist/package/browser/ApplicationShell.js",
		"dist/package/node/index.js",
		"dist/package/node/application.js",
		"dist/package/node/ApplicationShell.js",
	]) {
		if (!files.has(required)) throw new Error(`tarball is missing ${required}`);
	}
	for (const path of files) {
		if (path.startsWith("src/") || path.startsWith("src-tauri/")) {
			throw new Error(`tarball leaked repository source: ${path}`);
		}
		if (
			path.startsWith("dist/package/browser/test-utils/") ||
			/\.test\.[cm]?[jt]sx?$/.test(path)
		) {
			throw new Error(`tarball leaked test-only output: ${path}`);
		}
		if (
			path.startsWith("dist/package/packages/design/") &&
			/\/(?:README\.md|package\.json|tsconfig\.json)$/.test(path)
		) {
			throw new Error(`tarball leaked nested workspace metadata: ${path}`);
		}
	}
	if (manifest.private === true) throw new Error("package remains private");
	run("node", [
		"--input-type=module",
		"--eval",
		[
			"await import('./dist/package/node/index.js')",
			"await import('./dist/package/node/application.js')",
			"await import('./dist/package/node/ApplicationShell.js')",
		].join(";"),
	]);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
