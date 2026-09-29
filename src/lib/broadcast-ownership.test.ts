import { expect, test } from "bun:test";
import * as shared from "@forgeax/app-shell/application";
import { normalizeSourceStringDelimiters } from "../test-utils/source-text";
import * as legacy from "./broadcast-stream";

test("broadcast compatibility entry delegates transport state to App Shell", async () => {
	const source = normalizeSourceStringDelimiters(
		await Bun.file(new URL("./broadcast-stream.ts", import.meta.url)).text(),
	);
	expect(source).toContain("from '@forgeax/app-shell/application'");
	for (const forbidden of [
		"new WebSocket",
		"new Map",
		"new Set",
		"setTimeout",
		"__FORGEAX_BROADCAST_STREAM__",
	]) {
		expect(source).not.toContain(forbidden);
	}
});

test("legacy product URL policy and App Shell subscribers share a single transport", () => {
	const state = Reflect.get(globalThis, "__FORGEAX_BROADCAST_STREAM__");
	const saved = { ...state };
	const globals = ["window", "WebSocket"].map(
		(key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
	);
	const sockets: Socket[] = [];
	class Socket {
		static OPEN = 1;
		static CLOSED = 3;
		readyState = 0;
		onmessage?: (event: { data: string }) => void;
		constructor(readonly url: string) {
			sockets.push(this);
		}
		close() {
			this.readyState = 3;
		}
	}
	try {
		Object.assign(state, {
			ws: null,
			desired: false,
			url: "",
			retryMs: 1000,
			retryTimer: null,
			handlers: new Map(),
		});
		Object.defineProperty(globalThis, "WebSocket", {
			configurable: true,
			value: Socket,
		});
		const location = { protocol: "https:", host: "example.test:1234" };
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { location },
		});
		expect(legacy.getBroadcastStatus()).toEqual({
			connected: false,
			url: "wss://example.test:1234/ws",
		});
		expect(sockets).toHaveLength(0);
		expect(legacy.subscribeBroadcast).toBe(shared.subscribeBroadcast);
		expect(legacy.disconnect).toBe(shared.disconnectBroadcast);
		const seen: unknown[] = [];
		const stop = shared.subscribeBroadcast("tick", (frame) => seen.push(frame));
		legacy.connect();
		legacy.connect();
		expect(sockets).toHaveLength(1);
		expect(sockets[0]!.url).toBe("wss://example.test:1234/ws");
		sockets[0]!.onmessage!({ data: '{"type":"tick"}' });
		expect(seen).toHaveLength(1);
		stop();
		legacy.disconnect();
		legacy.connect("wss://custom.test/events");
		legacy.disconnect();
		legacy.connect();
		expect(sockets.at(-1)!.url).toBe("wss://custom.test/events");
		legacy.disconnect();
		state.url = "";
		location.protocol = "http:";
		legacy.connect();
		expect(sockets.at(-1)!.url).toBe("ws://example.test:1234/ws");
		legacy.disconnect();
		Reflect.deleteProperty(globalThis, "window");
		const count = sockets.length;
		legacy.connect();
		expect(sockets).toHaveLength(count);
	} finally {
		Object.assign(state, saved);
		for (const [key, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
	}
});
