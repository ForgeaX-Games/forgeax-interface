import { afterEach, expect, test } from "bun:test";
import { subscribeUiEvents } from "./ui-event-stream";

const oldWindow = globalThis.window;
const oldSocket = globalThis.WebSocket;
afterEach(() => {
	globalThis.window = oldWindow;
	globalThis.WebSocket = oldSocket;
});
test("UI notifications use WS, parse envelopes and ignore frames after disposal", () => {
	const sockets: any[] = [];
	globalThis.window = { location: { href: "http://localhost:19460/" } } as any;
	globalThis.WebSocket = class {
		onopen?: () => void;
		onmessage?: (e: any) => void;
		onclose?: () => void;
		closed = false;
		constructor(readonly url: URL) {
			sockets.push(this);
		}
		addEventListener(type: string, listener: (...args: any[]) => void) {
			(this as any)[`on${type}`] = listener;
		}
		close() {
			this.closed = true;
			this.onclose?.();
		}
	} as any;
	let opens = 0;
	const values: unknown[] = [];
	const dispose = subscribeUiEvents(
		"projects.active.changed",
		(value) => values.push(value),
		() => {
			opens++;
		},
	);
	const ws = sockets[0];
	expect(ws.url.toString()).toBe(
		"ws://localhost:19460/ws/ui-events?topic=projects.active.changed",
	);
	ws.onopen();
	ws.onmessage({ data: "{invalid" });
	ws.onmessage({ data: '{"payload":{"activeSlug":"a"}}' });
	expect(opens).toBe(1);
	expect(values).toHaveLength(1);
	dispose();
	ws.onopen();
	ws.onmessage({ data: "{}" });
	expect(ws.closed).toBe(true);
	expect(opens).toBe(1);
	expect(values).toHaveLength(1);
});
test("reconnects with backoff and cancels queued reconnects on disposal", () => {
	const set = globalThis.setTimeout;
	const clear = globalThis.clearTimeout;
	const pending = new Map<number, () => void>();
	const waits: number[] = [];
	const sockets: any[] = [];
	let id = 0;
	globalThis.setTimeout = ((callback: () => void, ms: number) => {
		waits.push(ms);
		pending.set(++id, callback);
		return id;
	}) as any;
	globalThis.clearTimeout = ((key: number) => {
		pending.delete(key);
	}) as any;
	globalThis.window = { location: { href: "https://localhost/" } } as any;
	globalThis.WebSocket = class {
		onopen?: () => void;
		onclose?: () => void;
		constructor(readonly url: URL) {
			sockets.push(this);
		}
		addEventListener(type: string, listener: (...args: any[]) => void) {
			(this as any)[`on${type}`] = listener;
		}
		close() {
			this.onclose?.();
		}
	} as any;
	try {
		let opens = 0;
		const dispose = subscribeUiEvents(
			"plugin.reloaded",
			() => {},
			() => {
				opens++;
			},
		);
		expect(sockets[0].url.protocol).toBe("wss:");
		sockets[0].onclose();
		expect(waits).toEqual([500]);
		pending.get(1)!();
		pending.delete(1);
		sockets[1].onclose();
		expect(waits).toEqual([500, 1000]);
		pending.get(2)!();
		pending.delete(2);
		sockets[2].onopen();
		expect(opens).toBe(1);
		sockets[0].onopen();
		expect(opens).toBe(1);
		sockets[2].onclose();
		expect(waits).toEqual([500, 1000, 500]);
		dispose();
		expect(pending.size).toBe(0);
	} finally {
		globalThis.setTimeout = set;
		globalThis.clearTimeout = clear;
	}
});
