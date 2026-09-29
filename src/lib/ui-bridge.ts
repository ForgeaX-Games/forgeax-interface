import { installWindowMessageObservation } from "@forgeax/app-shell/react";
import { useShellStore } from "../store";
import {
	getSessionClient,
	hasSessionClient,
} from "../store-parts/session-client";
import { buildA11ySummary } from "./a11y-summary";
import { startActionDomDiscovery } from "./action-dom-discovery";
import { registerBuiltinActions } from "./builtin-actions";
import { isTrustedMessageOrigin } from "./trustedOrigins";
import { createUiActionBridgeBinding } from "./ui-action-bridge-binding";
import { bootCompatibilityUiActionBridge } from "./ui-action-bridge-compatibility";
import { installUiActionHighlight } from "./ui-action-highlight";
import { captureUiScreenshot } from "./ui-screenshot";
import { installVagActionBridge } from "./vag-action-bridge";

// ─── 全局快捷键的 iframe→host 接收器(todo 004)──────────────────────────────
// 焦点在 iframe 内时,命令面板(⌘K)/ useGlobalShortcuts 的顶层监听拿不到按键。
// 各 iframe 内装 `installShortcutForwarder`（权威在 @forgeax/extension-platform/transport，消费方 vendor）
// 把白名单键 postMessage 上来;此处校验 origin 后在顶层重放 → 现有监听自动统一处理。
// 常量与 Extension Platform transport 的 shortcut forwarder 保持一致；
// Interface 不静态依赖 transport 实现，因此在边界内联。
const FORGEAX_FORWARD_KEY = "FORGEAX_FORWARD_KEY";

let shortcutReceiverInstalled = false;

function installShortcutReceiver(): void {
	if (shortcutReceiverInstalled || typeof window === "undefined") return;
	shortcutReceiverInstalled = true;
	const onMessage = (e: MessageEvent): void => {
		if (
			!isTrustedMessageOrigin(e.origin) ||
			!e.data ||
			typeof e.data !== "object"
		)
			return;
		const d = e.data as {
			type?: unknown;
			key?: unknown;
			code?: unknown;
			keyCode?: unknown;
			metaKey?: unknown;
			ctrlKey?: unknown;
			shiftKey?: unknown;
			altKey?: unknown;
		};
		if (d.type !== FORGEAX_FORWARD_KEY || typeof d.key !== "string") return;
		// 在顶层重放 keydown → CommandPalette(window keydown)+ useGlobalShortcuts(capture)
		// 都在 window 上监听,dispatch 到 window 即 AT_TARGET 触发两者。合成事件 target=window,
		// isTypingTarget 返回 false,故 Esc / Ctrl+/ 等 allowInInput 键也照常。
		window.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: d.key,
				code: typeof d.code === "string" ? d.code : "",
				keyCode: typeof d.keyCode === "number" ? d.keyCode : 0,
				metaKey: !!d.metaKey,
				ctrlKey: !!d.ctrlKey,
				shiftKey: !!d.shiftKey,
				altKey: !!d.altKey,
				bubbles: true,
				cancelable: true,
			}),
		);
	};
	void installWindowMessageObservation({ target: window, onMessage });
}

const binding = createUiActionBridgeBinding(bootCompatibilityUiActionBridge);
export const configureUiActionBridge = binding.configure;

/** Compatibility callers and product startup share one page-lifetime selection. */
export function bootUiBridge(): void {
	if (typeof window === "undefined") return;
	binding.boot({
		getActiveSid: () => useShellStore.getState().activeSid,
		subscribeActiveSid: (listener) => {
			useShellStore.subscribe((state) => listener(state.activeSid));
		},
		subscribeSessionEvents: (listener) => {
			if (hasSessionClient())
				getSessionClient().onSessionEvent("ui-bridge", listener);
		},
		installPresentation: () => {
			registerBuiltinActions();
			startActionDomDiscovery();
			installUiActionHighlight();
			installVagActionBridge();
			installShortcutReceiver();
		},
		buildA11ySummary,
		captureUiScreenshot,
	});
}
