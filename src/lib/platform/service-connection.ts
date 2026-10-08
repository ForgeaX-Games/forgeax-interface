/** Service endpoints supplied by the product host before the interface boots. */
export interface ServiceConnection {
	/** Absolute HTTP(S) origin of the ForgeaX backend. */
	httpBaseUrl?: string;
	/** Absolute WS(S) origin; derived from httpBaseUrl when omitted. */
	webSocketBaseUrl?: string;
	/** Absolute HTTP(S) origin for backend-served assets. */
	assetBaseUrl?: string;
	/** A host-owned request executor, for example to attach authentication. */
	request?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
	/** A host-owned WS URL resolver, for example to attach a scoped token. */
	resolveWebSocketUrl?: (path: string) => string;
	/** Host-owned socket transport for Webviews without direct WS access. */
	openWebSocket?: (path: string) => ServiceWebSocket;
	/** A host-owned EventSource URL resolver, for example to attach a scoped token. */
	resolveEventSourceUrl?: (path: string) => string;
	/** Host-owned SSE transport for Webviews without direct HTTP access. */
	openEventSource?: (path: string) => ServiceEventSource;
	/** A host-owned asset URL resolver, for example to convert a Webview URI. */
	resolveAssetUrl?: (path: string) => string;
}

export interface ServiceWebSocket {
	readonly readyState: number;
	addEventListener(
		type: "message",
		listener: (event: MessageEvent<string>) => void,
	): void;
	addEventListener(
		type: "open" | "close" | "error",
		listener: (event: Event) => void,
	): void;
	send(data: string): void;
	close(): void;
}

export interface ServiceEventSource {
	readonly readyState: number;
	onerror: ((event: Event) => void) | null;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
	): void;
	close(): void;
}

let connection: ServiceConnection | null = null;

function checkedBase(
	value: string,
	protocols: readonly string[],
	name: string,
): string {
	const url = new URL(value);
	if (!protocols.includes(url.protocol)) {
		throw new TypeError(`${name} must use ${protocols.join(" or ")}`);
	}
	return url.href;
}

/** Pass null to restore the legacy browser/Tauri connection policy. */
export function configureServiceConnection(
	next: ServiceConnection | null,
): void {
	if (!next) {
		connection = null;
		return;
	}
	connection = {
		...next,
		...(next.httpBaseUrl
			? {
					httpBaseUrl: checkedBase(
						next.httpBaseUrl,
						["http:", "https:"],
						"httpBaseUrl",
					),
				}
			: {}),
		...(next.webSocketBaseUrl
			? {
					webSocketBaseUrl: checkedBase(
						next.webSocketBaseUrl,
						["ws:", "wss:"],
						"webSocketBaseUrl",
					),
				}
			: {}),
		...(next.assetBaseUrl
			? {
					assetBaseUrl: checkedBase(
						next.assetBaseUrl,
						["http:", "https:"],
						"assetBaseUrl",
					),
				}
			: {}),
	};
}

function resolve(path: string, base?: string): string {
	return base ? new URL(path, base).href : path;
}

/** Preserve relative paths in existing browser/Tauri deployments. */
export function serviceHttpUrl(path: string): string {
	return resolve(path, connection?.httpBaseUrl);
}

export function serviceEventSourceUrl(path: string): string {
	return connection?.resolveEventSourceUrl
		? connection.resolveEventSourceUrl(path)
		: serviceHttpUrl(path);
}

export function openServiceEventSource(path: string): ServiceEventSource {
	return connection?.openEventSource
		? connection.openEventSource(path)
		: new EventSource(serviceEventSourceUrl(path));
}

/** Use the host request executor for authenticated lifecycle uploads. */
export function serviceSendBeacon(path: string, body: Blob): boolean {
	if (connection?.request) {
		void serviceFetch(path, { method: "POST", body, keepalive: true }).catch(
			() => {},
		);
		return true;
	}
	return typeof navigator !== "undefined" &&
		typeof navigator.sendBeacon === "function"
		? navigator.sendBeacon(serviceHttpUrl(path), body)
		: false;
}

export function serviceAssetUrl(path: string): string {
	return connection?.resolveAssetUrl
		? connection.resolveAssetUrl(path)
		: resolve(path, connection?.assetBaseUrl ?? connection?.httpBaseUrl);
}

export function serviceWebSocketUrl(path: string): string {
	if (connection?.resolveWebSocketUrl)
		return connection.resolveWebSocketUrl(path);
	const base = connection?.webSocketBaseUrl ?? connection?.httpBaseUrl;
	if (base) {
		const url = new URL(path, base);
		url.protocol =
			url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
		return url.href;
	}
	if (typeof window === "undefined") return "";
	const location = window.location;
	const page =
		location.protocol && location.host ? location : new URL(location.href);
	const protocol = page.protocol === "https:" ? "wss:" : "ws:";
	return new URL(path, `${protocol}//${page.host}/`).href;
}

export function openServiceWebSocket(path: string): ServiceWebSocket {
	return connection?.openWebSocket
		? connection.openWebSocket(path)
		: new WebSocket(new URL(serviceWebSocketUrl(path)));
}

/** The only HTTP execution boundary; it does not modify global fetch. */
export function serviceFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const mapped =
		input instanceof Request
			? connection?.httpBaseUrl
				? new Request(serviceHttpUrl(input.url), input)
				: input
			: typeof input === "string"
				? serviceHttpUrl(input)
				: input;
	return connection?.request
		? connection.request(mapped, init)
		: fetch(mapped, init);
}
