import { describe, expect, test } from "bun:test";

describe("permission stream ownership", () => {
	test("leaves permission state and lifecycle in Chat", async () => {
		const packageJson = await Bun.file(
			new URL("../../package.json", import.meta.url),
		).json();
		const storeSource = await Bun.file(
			new URL("../store.ts", import.meta.url),
		).text();

		expect(packageJson.exports["./lib/permission-stream"]).toBeUndefined();
		expect(
			await Bun.file(
				new URL("./permission-stream.ts", import.meta.url),
			).exists(),
		).toBe(false);
		expect(storeSource).not.toContain("import('./lib/permission-stream')");
		expect(storeSource).not.toContain("dropPermissionSession(sid)");
	});
});
