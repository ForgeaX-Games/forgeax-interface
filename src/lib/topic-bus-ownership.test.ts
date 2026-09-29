import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	clearRetainedTopic,
	peekTopic,
	publishTopic,
	subscribeTopic,
} from "@forgeax/app-shell/application";
import { normalizeSourceStringDelimiters } from "../test-utils/source-text";
import * as legacy from "./bus";

describe("shared topic bus ownership", () => {
	it("shares function identity and retained state with the compatibility entry", () => {
		expect(legacy.publish).toBe(publishTopic);
		expect(legacy.subscribe).toBe(subscribeTopic);
		expect(legacy.peek).toBe(peekTopic);
		expect(legacy.clearRetained).toBe(clearRetainedTopic);
		const topic = "test:compatibility:retained";
		const payload = {};
		legacy.publish(topic, payload, { retain: true });
		const seen: unknown[] = [];
		const dispose = subscribeTopic(topic, (value) => seen.push(value));
		expect(seen).toEqual([payload]);
		expect(peekTopic(topic)).toBe(payload);
		dispose();
		legacy.clearRetained(topic);
		expect(peekTopic(topic)).toBeUndefined();
	});
	it("retains only a stateless compatibility entry for external consumers", () => {
		const source = normalizeSourceStringDelimiters(
			readFileSync(join(import.meta.dir, "bus.ts"), "utf8"),
		);
		expect(source).toContain("from '@forgeax/app-shell/application'");
		expect(source).not.toContain("globalThis");
		expect(source).not.toContain("new Map");
		expect(source).not.toContain("new Set");
	});

	it("uses the public App Shell owner for every production reader and writer", () => {
		for (const file of [
			"components/Sidebar/FilesPanel.tsx",
			"core/extensions/host-commands.ts",
			"lib/deep-link-bus.ts",
			"lib/use-bus-snapshot.ts",
			"store-compatibility.ts",
		]) {
			const source = normalizeSourceStringDelimiters(
				readFileSync(join(import.meta.dir, "..", file), "utf8"),
			);
			expect(source).toContain("from '@forgeax/app-shell/application'");
			expect(source).not.toMatch(/from ['"][^'"]*\/bus['"]/);
		}
	});
});
