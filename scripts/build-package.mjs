import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, "dist", "package");
const sourceOutputRoot = join(outputRoot, "src");
const browserOutputRoot = join(outputRoot, "browser");
const nodeOutputRoot = join(outputRoot, "node");
const sourceAssetExtensions = new Set([".css", ".json", ".png", ".svg"]);
const designAssetExtensions = new Set([".css"]);

function run(command, args) {
	const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

function copyAssets(sourceRoot, destinationRoot, extensions) {
	for (const source of walk(sourceRoot)) {
		if (!extensions.has(extname(source))) continue;
		const destination = join(destinationRoot, relative(sourceRoot, source));
		mkdirSync(dirname(destination), { recursive: true });
		copyFileSync(source, destination);
	}
}

function relativeAliasTarget(path, specifier) {
	const target = join(sourceOutputRoot, specifier);
	const pathFromImporter = relative(dirname(path), target).split(sep).join("/");
	return pathFromImporter.startsWith(".")
		? pathFromImporter
		: `./${pathFromImporter}`;
}

function rewriteSourceAliases() {
	for (const path of walk(sourceOutputRoot)) {
		if (![".js", ".d.ts"].some((suffix) => path.endsWith(suffix))) continue;
		const source = readFileSync(path, "utf8");
		const rewritten = source
			.replace(
				/(['"])@\/([^'"]+)\1/g,
				(_match, quote, specifier) =>
					`${quote}${relativeAliasTarget(path, specifier)}${quote}`,
			)
			.replace(/^\s*import\s+['"][^'"]+\.d['"];?[^\n]*$/gm, "");
		if (rewritten !== source) writeFileSync(path, rewritten);
	}
}

function copyNodeModules() {
	for (const source of walk(browserOutputRoot)) {
		if (!source.endsWith(".js") && !source.endsWith(".json")) continue;
		const destination = join(
			nodeOutputRoot,
			relative(browserOutputRoot, source),
		);
		mkdirSync(dirname(destination), { recursive: true });
		copyFileSync(source, destination);
	}
}

function nodeRelativeTarget(importer, specifier) {
	const unresolved = resolve(dirname(importer), specifier);
	if (existsSync(`${unresolved}.js`)) return `${specifier}.js`;
	if (existsSync(join(unresolved, "index.js"))) return `${specifier}/index.js`;
	return specifier;
}

function rewriteNodeModules() {
	for (const path of walk(nodeOutputRoot)) {
		if (!path.endsWith(".js")) continue;
		const source = readFileSync(path, "utf8")
			.replace(/^\s*import\s+['"][^'"]+\.css['"];?\s*$/gm, "")
			.replace(
				/(\b(?:from|import)\s*(?:\(\s*)?)(['"])(\.\.?\/[^'"]+)\2(\s*\)?)/g,
				(_match, prefix, quote, specifier, suffix) =>
					`${prefix}${quote}${nodeRelativeTarget(path, specifier)}${quote}${suffix}`,
			)
			.replace(
				/(\bimport\s+[^;]+?\s+from\s+(['"])[^'"]+\.json\2)(\s*;)/g,
				"$1 with { type: 'json' }$3",
			);
		writeFileSync(path, source);
	}
}

// Check source before deleting a previously successful package build.
run("bun", ["run", "lint"]);
rmSync(outputRoot, { recursive: true, force: true });
run("bunx", [
	"tsc",
	"-p",
	"tsconfig.package.json",
	"--noEmit",
	"false",
	"--declaration",
	"true",
	"--declarationMap",
	"false",
	"--sourceMap",
	"false",
	"--outDir",
	outputRoot,
	"--rootDir",
	".",
	"--incremental",
	"false",
]);
copyAssets(join(root, "src"), sourceOutputRoot, sourceAssetExtensions);
copyAssets(
	join(root, "packages", "design"),
	join(outputRoot, "packages", "design"),
	designAssetExtensions,
);
rewriteSourceAliases();
renameSync(sourceOutputRoot, browserOutputRoot);
copyNodeModules();
rewriteNodeModules();

if (!statSync(join(browserOutputRoot, "index.js")).isFile()) {
	throw new Error("package build did not emit the root entry");
}
