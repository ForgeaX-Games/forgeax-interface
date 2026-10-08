import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { dashApi } from "../dashboard-api";
import { subscribeUiEvents } from "../ui-event-stream";
import {
	configureServiceConnection,
	openServiceEventSource,
	serviceAssetUrl,
	serviceEventSourceUrl,
	serviceFetch,
	serviceHttpUrl,
	serviceSendBeacon,
	serviceWebSocketUrl,
} from "./service-connection";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;

afterEach(() => {
	configureServiceConnection(null);
	globalThis.fetch = originalFetch;
	if (originalWindow)
		Object.defineProperty(globalThis, "window", originalWindow);
	else Reflect.deleteProperty(globalThis, "window");
});

test("Webview transport factories receive logical paths and release subscriptions", () => {
	const paths: string[] = [];
	const listeners = new Map<string, (event: Event) => void>();
	let socketClosed = 0;
	let streamClosed = 0;
	configureServiceConnection({
		openWebSocket: (path) => {
			paths.push(path);
			return {
				readyState: 1,
				addEventListener: (type: string, listener: (event: Event) => void) => {
					listeners.set(type, listener);
				},
				send: () => {},
				close: () => {
					socketClosed++;
				},
			};
		},
		openEventSource: (path) => {
			paths.push(path);
			return {
				readyState: 1,
				onerror: null,
				addEventListener: () => {},
				close: () => {
					streamClosed++;
				},
			};
		},
	});
	const seen: unknown[] = [];
	const dispose = subscribeUiEvents("game.changed", (value) =>
		seen.push(value),
	);
	listeners.get("message")?.(
		new MessageEvent("message", { data: '{"slug":"demo"}' }),
	);
	expect(seen).toEqual([{ slug: "demo" }]);
	const stream = openServiceEventSource(
		"/api/events/stream?topic=plugin.reloaded",
	);
	expect(paths).toEqual([
		"/ws/ui-events?topic=game.changed",
		"/api/events/stream?topic=plugin.reloaded",
	]);
	dispose();
	stream.close();
	expect(socketClosed).toBe(1);
	expect(streamClosed).toBe(1);
});

test("business HTTP and UI events connect to a real loopback service on another origin", async () => {
	const received: { auth?: string; topic?: string } = {};
	const sockets = new Set<Socket>();
	const server = createServer((request, response) => {
		if (request.url === "/api/health") {
			received.auth = request.headers["x-host-token"] as string | undefined;
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ status: "ok", version: "test" }));
			return;
		}
		response.writeHead(404).end("missing");
	});
	server.on("upgrade", (request, socket) => {
		const url = new URL(request.url ?? "", "http://127.0.0.1");
		received.topic = url.searchParams.get("topic") ?? undefined;
		const key = request.headers["sec-websocket-key"];
		if (
			url.pathname !== "/ws/ui-events" ||
			url.searchParams.get("token") !== "ws-secret" ||
			!key
		) {
			socket.destroy();
			return;
		}
		sockets.add(socket);
		const accept = createHash("sha1")
			.update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
			.digest("base64");
		socket.write(
			`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
		);
		const frame = Buffer.from(JSON.stringify({ type: "ready" }));
		socket.write(Buffer.concat([Buffer.from([0x81, frame.length]), frame]));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing loopback port");
	const origin = `http://127.0.0.1:${address.port}`;
	let dispose = () => {};
	try {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { location: new URL("http://127.0.0.1:19191/page") },
		});
		configureServiceConnection({
			httpBaseUrl: origin,
			request: (input, init) => {
				const headers = new Headers(init?.headers);
				headers.set("x-host-token", "http-secret");
				return Bun.fetch(input, { ...init, headers });
			},
			resolveWebSocketUrl: (path) => {
				const url = new URL(path, origin);
				url.protocol = "ws:";
				url.searchParams.set("token", "ws-secret");
				return url.href;
			},
		});
		const health = await dashApi.health();
		expect(health.status).toBe("ok");
		expect(received.auth).toBe("http-secret");
		expect(serviceEventSourceUrl("/api/events")).toBe(`${origin}/api/events`);
		expect(serviceAssetUrl("/assets/icon.svg")).toBe(
			`${origin}/assets/icon.svg`,
		);
		const event = new Promise<unknown>((resolve) => {
			dispose = subscribeUiEvents("project.changed", resolve);
		});
		expect(
			await Promise.race([
				event,
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("WS timed out")), 3000),
				),
			]),
		).toEqual({ type: "ready" });
		expect(received.topic).toBe("project.changed");
	} finally {
		dispose();
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test("legacy browser/Tauri policy keeps relative HTTP and page-origin WebSocket URLs", async () => {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: new URL("https://studio.example.test/page") },
	});
	let requested: RequestInfo | URL | undefined;
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requested = input;
		return Response.json({ ok: true });
	}) as typeof fetch;
	await serviceFetch("/api/health");
	expect(requested).toBe("/api/health");
	expect(serviceHttpUrl("/api/health")).toBe("/api/health");
	expect(serviceWebSocketUrl("/ws")).toBe("wss://studio.example.test/ws");
	(window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ =
		{};
	expect(serviceHttpUrl("/api/health")).toBe("/api/health");
	expect(serviceWebSocketUrl("/ws")).toBe("wss://studio.example.test/ws");
	(window as unknown as { location: URL }).location = new URL(
		"tauri://localhost/page",
	);
	expect(serviceWebSocketUrl("/ws")).toBe("ws://localhost/ws");
});

test("invalid host endpoint configuration fails before service requests", () => {
	expect(() =>
		configureServiceConnection({ httpBaseUrl: "file:///tmp/server" }),
	).toThrow("httpBaseUrl must use http: or https:");
	expect(() =>
		configureServiceConnection({ webSocketBaseUrl: "https://server.test" }),
	).toThrow("webSocketBaseUrl must use ws: or wss:");
});

test("host-owned event and lifecycle upload paths retain authentication", async () => {
	const uploads: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	configureServiceConnection({
		httpBaseUrl: "http://127.0.0.1:17000",
		resolveEventSourceUrl: (path) =>
			`http://127.0.0.1:17000${path}&token=events-secret`,
		request: async (input, init) => {
			uploads.push({ input, init });
			return new Response(null, { status: 204 });
		},
	});
	expect(serviceEventSourceUrl("/api/events?topic=ready")).toBe(
		"http://127.0.0.1:17000/api/events?topic=ready&token=events-secret",
	);
	expect(serviceSendBeacon("/api/logs", new Blob(["log"]))).toBe(true);
	await Promise.resolve();
	expect(uploads).toHaveLength(1);
	expect(uploads[0]?.input).toBe("http://127.0.0.1:17000/api/logs");
	expect(uploads[0]?.init?.keepalive).toBe(true);
});
