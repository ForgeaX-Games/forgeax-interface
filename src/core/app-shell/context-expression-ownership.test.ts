import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import * as platform from "@forgeax/extension-platform/platform";
import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";
import { createContextKeys } from "../extension-foundation/context-keys";
import {
	evaluateContextExpression,
	getContextExpressionKeys,
} from "../panels/context-expression";
import { resolvePanelActionState } from "../panels/resolve-panel-action-state";

describe("context expression ownership", () => {
	it("delegates the existing public compatibility path directly to Extension Platform", () => {
		expect(evaluateContextExpression).toBe(
			Reflect.get(platform, "evaluateContextExpression"),
		);
		expect(getContextExpressionKeys).toBe(
			Reflect.get(platform, "getContextExpressionKeys"),
		);
		const source = normalizeSourceStringDelimiters(
			readFileSync(
				new URL("../panels/context-expression.ts", import.meta.url),
				"utf8",
			),
		);
		expect(source).toContain("from '@forgeax/extension-platform/platform'");
		expect(source).not.toContain("function ");
	});

	it("retains panel state defaults and live context values in Interface", () => {
		const keys = createContextKeys();
		expect(resolvePanelActionState({}, keys)).toEqual({
			visible: true,
			enabled: true,
			active: false,
			highlighted: false,
		});
		const action = {
			when: "visible",
			enablement: "count == 2",
			activeWhen: 'mode == "ready"',
			highlightWhen: "!busy",
		};
		expect(resolvePanelActionState(action, keys)).toEqual({
			visible: false,
			enabled: false,
			active: false,
			highlighted: true,
		});
		keys.set("visible", true);
		keys.set("count", 2);
		keys.set("mode", "ready");
		keys.set("busy", true);
		expect(resolvePanelActionState(action, keys)).toEqual({
			visible: true,
			enabled: true,
			active: true,
			highlighted: false,
		});
	});

	it("characterizes legacy truthiness, precedence, strict comparison and fallback", () => {
		const keys = createContextKeys();
		keys.set("yes", true);
		keys.set("no", false);
		keys.set("count", 2);
		keys.set("text", "2");
		const cases: Array<[string | undefined, boolean, boolean]> = [
			[undefined, true, true],
			["  ", false, false],
			["no || yes && count", false, true],
			["yes || no && no", false, true],
			["!!yes", false, true],
			["!!!yes", false, false],
			["count == 2", false, true],
			["text == 2", false, false],
			['text == "2"', false, true],
			['count != "2"', false, true],
			["!count == 2", false, false],
			["count == 0x2", false, true],
			["count == 2e0", false, true],
			["(yes)", false, false],
			['"yes||no"', false, false],
			["no ||", false, true],
			["!", false, true],
			['""', true, false],
		];
		for (const [expression, fallback, result] of cases) {
			expect(
				evaluateContextExpression(expression, keys, fallback),
				String(expression),
			).toBe(result);
		}
	});

	it("preserves left-to-right short circuit and getter failure identity", () => {
		const keys = createContextKeys();
		const trace: string[] = [];
		const failure = new Error("read failed");
		keys.get = (key) => {
			trace.push(key);
			if (key === "explode") throw failure;
			return (key === "yes") as never;
		};
		expect(
			evaluateContextExpression("no && explode || yes || explode", keys, false),
		).toBe(true);
		expect(trace).toEqual(["no", "yes"]);
		expect(() => evaluateContextExpression("explode", keys, false)).toThrow(
			failure,
		);
	});

	it("preserves raw key scanning including words inside literals, order and deduplication", () => {
		expect(getContextExpressionKeys(undefined)).toEqual([]);
		expect(
			getContextExpressionKeys(
				'panel.ready && mode == "ready" || panel.ready || foo:bar-baz',
			),
		).toEqual(["panel.ready", "mode", "ready", "foo:bar-baz"]);
		expect(getContextExpressionKeys("true false null TRUE 2e3 _key")).toEqual([
			"TRUE",
			"e3",
			"_key",
		]);
	});
});
