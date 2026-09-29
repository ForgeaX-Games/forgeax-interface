import { afterEach, beforeEach, expect, test } from "bun:test";
import { listGameTemplates } from "./game-templates";

let originalFetch: typeof fetch;

beforeEach(() => {
	originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

test("loads templates from the Projects API", async () => {
	let requested: string | undefined;
	globalThis.fetch = (async (input) => {
		requested = String(input);
		return Response.json({
			templates: [
				{ slug: "game-default", name: "Default" },
				{ slug: "", name: "Invalid" },
			],
		});
	}) as typeof fetch;

	await expect(listGameTemplates()).resolves.toEqual([
		{ slug: "game-default", name: "Default" },
	]);
	expect(requested).toBe("/api/projects/templates");
});
