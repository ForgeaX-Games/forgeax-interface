/** Read-only UI events. WebSockets do not consume the HTTP/1 request pool. */
import {
	openServiceWebSocket,
	type ServiceWebSocket,
} from "./platform/service-connection";

export function subscribeUiEvents(
	topic: string,
	listener: (event: unknown) => void,
	onOpen?: () => void,
): () => void {
	let stopped = false;
	let socket: ServiceWebSocket | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let delay = 500;
	const connect = () => {
		if (stopped) return;
		const current = openServiceWebSocket(
			`/ws/ui-events?topic=${encodeURIComponent(topic)}`,
		);
		socket = current;
		current.addEventListener("open", () => {
			if (stopped || current !== socket) return;
			delay = 500;
			onOpen?.();
		});
		current.addEventListener("message", (event) => {
			if (stopped || current !== socket) return;
			let value: unknown;
			try {
				value = JSON.parse(String(event.data));
			} catch {
				return;
			}
			listener(value);
		});
		current.addEventListener("error", () => current.close());
		current.addEventListener("close", () => {
			if (stopped || current !== socket) return;
			socket = undefined;
			retry = setTimeout(connect, delay);
			delay = Math.min(delay * 2, 10_000);
		});
	};
	connect();
	return () => {
		stopped = true;
		if (retry !== undefined) clearTimeout(retry);
		socket?.close();
		socket = undefined;
	};
}
