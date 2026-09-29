import { describe, expect, test } from "bun:test";
import { deriveExtensionKindCounts } from "./resilient-polling";

describe("deriveExtensionKindCounts", () => {
	test("derives all status chips from one full extension list", () => {
		const result = deriveExtensionKindCounts([
			{ id: "model-a", kind: "model-binding" },
			{ id: "skill-a", kind: "skill" },
			{ id: "skill-b", kind: "skill" },
			{ id: "tool-a", kind: "tool" },
			{ id: "agent-a", kind: "agent" },
		]);

		expect(result).toEqual({
			"model-binding": { count: 1, ids: ["model-a"] },
			skill: { count: 2, ids: ["skill-a", "skill-b"] },
			tool: { count: 1, ids: ["tool-a"] },
			agent: { count: 1, ids: ["agent-a"] },
		});
	});
});
