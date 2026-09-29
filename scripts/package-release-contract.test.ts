import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const manifest = JSON.parse(
	readFileSync(join(root, "package.json"), "utf8"),
) as {
	version?: string;
	private?: boolean;
	files?: string[];
	exports?: Record<string, unknown>;
	scripts?: Record<string, string>;
	publishConfig?: { access?: string };
	engines?: { node?: string };
};

describe("Interface release package contract", () => {
	test("publishes a built public library instead of workspace source", () => {
		expect(manifest.version).toBe("0.9.5");
		expect(manifest.private).not.toBe(true);
		expect(manifest.publishConfig?.access).toBe("public");
		expect(manifest.engines?.node).toBe(">=20.10");
		expect(manifest.files).toEqual([
			"dist/package",
			"README.md",
			"LICENSE",
			"NOTICE",
		]);
		expect(JSON.stringify(manifest.exports)).not.toContain('"./src/');
		expect(JSON.stringify(manifest.exports)).not.toContain(
			"./dist/package/src/",
		);
		expect(JSON.stringify(manifest.exports)).not.toMatch(/(?<!\.d)\.tsx?"/);
		expect(JSON.stringify(manifest.exports)).toContain("./dist/package/");
		expect(JSON.stringify(manifest.exports)).toContain("./dist/package/node/");
	});

	test("builds and verifies the package before packing", () => {
		expect(manifest.scripts?.build).toBe("bun run build:package");
		for (const entry of [
			"dev",
			"build:app",
			"preview",
			"tauri",
			"tauri:dev",
			"tauri:build",
		]) {
			expect(manifest.scripts?.[entry]).toBeUndefined();
		}
		for (const entry of [
			"index.html",
			"src/main.tsx",
			"vite.config.ts",
			"src-tauri/Cargo.toml",
		]) {
			expect(existsSync(join(root, entry))).toBe(false);
		}
		expect(manifest.scripts?.prepack).toBe("bun run build:package");
		expect(manifest.scripts?.["release:preflight"]).toBe(
			"bun scripts/check-release-package.mjs",
		);
		expect(existsSync(join(root, "src/index.ts"))).toBe(true);
		expect(existsSync(join(root, "tsconfig.package.json"))).toBe(true);
		expect(existsSync(join(root, "scripts/build-package.mjs"))).toBe(true);
		expect(existsSync(join(root, "scripts/check-release-package.mjs"))).toBe(
			true,
		);
	});

	test("keeps shipped i18n module documentation independent of developer paths", () => {
		const source = ["index.ts", "runtime.ts", "standalone.ts"]
			.map((file) => readFileSync(join(root, "src/i18n", file), "utf8"))
			.join("\n");
		const hasDeveloperPath =
			/\/(?:Users|home|root|Volumes)\/|[A-Z]:[\\/](?:Users|Documents and Settings)[\\/]/u.test(
				source,
			);
		expect(hasDeveloperPath).toBe(false);
		expect(source).toContain("English is the SOURCE OF TRUTH");
	});

	test("uses the organization publish pipeline with semver tags", () => {
		const tagWorkflow = readFileSync(
			join(root, ".github/workflows/tag-release.yml"),
			"utf8",
		);
		const publishWorkflow = readFileSync(
			join(root, ".github/workflows/publish.yml"),
			"utf8",
		);
		const identityWorkflow = readFileSync(
			join(root, ".github/workflows/identity-contract.yml"),
			"utf8",
		);

		expect(tagWorkflow).toContain('tag="v${ver}"');
		expect(publishWorkflow).toContain("tags: ['v*']");
		expect(publishWorkflow).toContain(
			"ForgeaX-Games/forgeax-ci/.github/workflows/npm-publish.yml@f89be99237af38740c13c93d319266f7b5818cb9",
		);
		expect(publishWorkflow).toContain("bun run release:preflight");
		expect(publishWorkflow).toContain(
			"dry-run: ${{ github.event_name == 'workflow_dispatch' && inputs.dry-run || false }}",
		);
		expect(tagWorkflow).toContain("actions: write");
		expect(tagWorkflow).toContain('echo "created=true" >> "$GITHUB_OUTPUT"');
		expect(tagWorkflow).toContain('echo "created=false" >> "$GITHUB_OUTPUT"');
		expect(identityWorkflow.indexOf("bun run check")).toBeLessThan(
			identityWorkflow.indexOf("node-version: '20.10.0'"),
		);
		expect(tagWorkflow.indexOf("bun run check")).toBeLessThan(
			tagWorkflow.indexOf("node-version: '20.10.0'"),
		);
	});

	test("requires immutable source verification before publication and defaults manual runs to dry-run", () => {
		const workflow = Bun.YAML.parse(
			readFileSync(join(root, ".github/workflows/publish.yml"), "utf8"),
		) as any;
		const inputs = workflow.on.workflow_dispatch.inputs;
		expect(inputs["release-tag"]).toMatchObject({
			type: "string",
			required: true,
		});
		expect(inputs["dry-run"]).toMatchObject({ type: "boolean", default: true });
		expect(workflow.jobs.publish.needs).toBe("validate-release");
		expect(workflow.jobs["validate-release"].steps.at(-1).run).toBe(
			"node .github/scripts/verify-release-source.mjs",
		);
		const gates = workflow.jobs.publish.with["gate-command"].trim().split("\n");
		expect(gates[0]).toBe("node .github/scripts/verify-release-source.mjs");
		expect(gates.at(-1)).toBe("node .github/scripts/verify-release-source.mjs");
		expect(workflow.concurrency.group).toContain(
			"github.event_name == 'push' && github.ref_name || inputs.release-tag",
		);
		expect(workflow.permissions).toEqual({ contents: "read" });
	});

	test("dispatches a newly created tag through main and propagates dispatch failure", async () => {
		const workflow = Bun.YAML.parse(
			readFileSync(join(root, ".github/workflows/tag-release.yml"), "utf8"),
		) as any;
		const step = workflow.jobs.tag.steps.find(
			(entry: { name?: string }) =>
				entry.name === "Dispatch exact tag publication",
		);
		expect(step).toBeDefined();
		expect(step.if).toBe("steps.release.outputs.created == 'true'");
		expect(step.env.RELEASE_TAG).toBe("${{ steps.release.outputs.tag }}");
		expect(workflow.jobs.tag.permissions).toEqual({
			contents: "write",
			actions: "write",
		});
		const AsyncFunction = Object.getPrototypeOf(
			async function () {},
		).constructor;
		const dispatch = new AsyncFunction(
			"github",
			"context",
			"process",
			step.with.script,
		);
		const requests: unknown[] = [];
		const context = {
			repo: { owner: "ForgeaX-Games", repo: "forgeax-interface" },
		};
		const process = { env: { RELEASE_TAG: "v0.4.0" } };
		await dispatch(
			{
				rest: {
					actions: {
						createWorkflowDispatch: async (request: unknown) =>
							requests.push(request),
					},
				},
			},
			context,
			process,
		);
		expect(requests).toEqual([
			{
				owner: "ForgeaX-Games",
				repo: "forgeax-interface",
				workflow_id: "publish.yml",
				ref: "main",
				inputs: { "release-tag": "v0.4.0", "dry-run": "false" },
			},
		]);
		await expect(
			dispatch(
				{
					rest: {
						actions: {
							createWorkflowDispatch: async () => {
								throw new Error("dispatch denied");
							},
						},
					},
				},
				context,
				process,
			),
		).rejects.toThrow("dispatch denied");
	});
});
