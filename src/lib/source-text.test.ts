import { expect, test } from "bun:test";

import { normalizeSourceStringDelimiters } from "../test-utils/source-text";

test("normalizes only string literal delimiters while preserving values and JSX", () => {
	const source = `const a = "it's"; const b = 'it\\'s'; const template = \`"value"\`; const view = <span title="tip">"text"</span>;`;

	expect(normalizeSourceStringDelimiters(source)).toBe(
		"const a = 'it\\'s'; const b = 'it\\'s'; const template = `\"value\"`; const view = <span title=\"tip\">\"text\"</span>;",
	);
	expect(normalizeSourceStringDelimiters('"a"')).not.toBe(
		normalizeSourceStringDelimiters('"b"'),
	);
});
