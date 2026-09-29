import { describe, expect, test } from "bun:test";
import type { ExtensionInfo } from "../../lib/extension-api";
import { buildIframeSrc } from "./StandaloneExtensionIframe";

const plugin: ExtensionInfo = {
	id: "@forgeax-extension/counter",
	version: "0.1.0",
	kind: "page",
	displayName: "Counter",
	frontendUrl: "http://127.0.0.1:5173/custom?token=one",
	allowedOrigin: "http://127.0.0.1:5173",
	runtimeMode: "dev",
};

describe("StandaloneExtensionIframe explicit runtime URL", () => {
	test("prefers frontendUrl and preserves its path and query", () => {
		const url = buildIframeSrc(plugin, "center", "game-one");
		expect(url).toStartWith("http://127.0.0.1:5173/custom?token=one&");
		expect(url).toContain("pane=center");
		expect(url).toContain("slug=game-one");
	});

	test("standalone port wins over entry.frontend when embeddedAlso is false", () => {
		const reel: ExtensionInfo = {
			id: "@forgeax-extension/reel",
			version: "0.2.0",
			kind: "authoring",
			displayName: "Reel Studio",
			runtimeMode: "standalone",
			entry: {
				frontend: "./dist/index.html",
				standalone: {
					start: "bun run dev",
					port: 15175,
					readyProbe: "/",
					embeddedAlso: false,
				},
			},
		};
		const url = buildIframeSrc(reel, "left", "0909");
		expect(url).toStartWith(
			`${window.location.protocol}//${window.location.hostname}:15175/`,
		);
		expect(url).toContain("pane=left");
		expect(url).not.toContain("/extensions/reel/");
	});

	test("embeddedAlso true keeps host-served /extensions path", () => {
		const embedded: ExtensionInfo = {
			id: "@forgeax-extension/example",
			version: "0.1.0",
			kind: "tool",
			displayName: "Example",
			entry: {
				frontend: "./dist/index.html",
				standalone: {
					start: "bun run dev",
					port: 15999,
					embeddedAlso: true,
				},
			},
		};
		const url = buildIframeSrc(embedded, "center", "game-one");
		expect(url).toStartWith("/extensions/example/");
	});
});
