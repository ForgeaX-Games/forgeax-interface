import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const read = (relativePath: string): string =>
	normalizeSourceStringDelimiters(
		readFileSync(new URL(relativePath, import.meta.url), "utf8"),
	);

describe("application platform ownership", () => {
	it("delegates the React host context to App Shell", () => {
		const source = read("./react/HostProvider.tsx");

		expect(source).toContain("from '@forgeax/app-shell/application'");
		expect(source).not.toContain("createContext(");
	});

	it("delegates the process-wide dirty probe to App Shell", () => {
		const source = read("../page-platform/page-dirty-probe.ts");

		expect(source).toContain("from '@forgeax/app-shell/application'");
		expect(source).not.toContain("let probe");
	});

	it("delegates the installed-host page navigation contract to App Shell", () => {
		const source = read("../page-navigation.ts");

		expect(source).toContain("from '@forgeax/app-shell/application'");
		expect(source).not.toContain("let current");
		expect(source).not.toContain("from '../lib/extension-api'");
	});
});
