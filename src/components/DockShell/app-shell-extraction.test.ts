import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { normalizeSourceStringDelimiters } from "../../test-utils/source-text";

const readSource = (relativePath: string): string => {
	const source = readFileSync(
		fileURLToPath(new URL(relativePath, import.meta.url)),
		"utf8",
	);
	return relativePath.endsWith(".json")
		? source
		: normalizeSourceStringDelimiters(source);
};

describe("app-shell extraction boundary", () => {
	test.each([
		"./regions.ts",
		"./resolveRegion.ts",
		"./dockviewRegistry.ts",
		"./sideEdgeMove.ts",
	])(
		"%s remains a compatibility re-export without a local implementation",
		(relativePath) => {
			const source = readSource(relativePath);

			expect(source).toContain("from '@forgeax/app-shell/dock'");
			expect(source).not.toMatch(/\b(?:const|function|class|interface)\s+\w+/);
		},
	);

	test("representative Interface surfaces render app-shell primitives", () => {
		const panelShell = readSource("../PanelShell/PanelShell.tsx");
		const mainArea = readSource("../MainArea/MainArea.tsx");

		expect(panelShell).toMatch(
			/import\s*\{[^}]*PanelSurface[^}]*\}\s*from '@forgeax\/app-shell\/react'/s,
		);
		expect(panelShell).toContain("<PanelSurface");
		expect(panelShell).not.toContain("<ShellSlot");
		expect(mainArea).toContain("from '@forgeax/app-shell/react'");
		expect(mainArea).toContain('<ShellSlot name="MainAreaBody"');
	});

	test("balanced product custom-event subscriptions delegate lifecycle ownership", () => {
		const connectPrompt = readSource("../Onboarding/ConnectModelPrompt.tsx");
		const onboarding = readSource("../Onboarding/types.ts");
		const passiveFeedback = readSource("../Feedback/PassiveFeedback.tsx");
		const trajectory = readSource("../../lib/ui-trajectory.ts");

		for (const source of [
			connectPrompt,
			onboarding,
			passiveFeedback,
			trajectory,
		]) {
			expect(source).toContain("from '@forgeax/app-shell/react'");
			expect(source).toContain("installCustomEventObservation");
		}

		expect(connectPrompt).toContain(
			"const disposeOpenPromptObservation = installCustomEventObservation({",
		);
		expect(connectPrompt).toContain("return disposeOpenPromptObservation;");
		expect(connectPrompt).not.toContain(
			"window.addEventListener(APP_EVENTS.openConnectPrompt",
		);
		expect(connectPrompt).not.toContain(
			"window.removeEventListener(APP_EVENTS.openConnectPrompt",
		);

		expect(onboarding).toContain(
			"const disposeOnboardingObservation = installCustomEventObservation({",
		);
		expect(onboarding).toContain("disposeOnboardingObservation();");
		expect(onboarding).not.toContain(
			"window.addEventListener(APP_EVENTS.onboardingChanged",
		);
		expect(onboarding).not.toContain(
			"window.removeEventListener(APP_EVENTS.onboardingChanged",
		);

		expect(passiveFeedback).toContain(
			"const disposeSignalObservation = installCustomEventObservation({",
		);
		expect(passiveFeedback).toContain(
			"const disposeRecoveredObservation = installCustomEventObservation({",
		);
		expect(passiveFeedback).toContain("disposeSignalObservation();");
		expect(passiveFeedback).toContain("disposeRecoveredObservation();");
		expect(passiveFeedback).not.toContain(
			"window.addEventListener(PASSIVE_FEEDBACK_EVENT",
		);
		expect(passiveFeedback).not.toContain(
			"window.addEventListener(PASSIVE_FEEDBACK_RECOVERED_EVENT",
		);
		expect(passiveFeedback).toContain(
			"const unsubscribe = useHealthStore.subscribe(ingestHealth);",
		);
		expect(passiveFeedback).toContain(
			"const heartbeat = createIntervalTaskLifecycle({",
		);
		expect(passiveFeedback).toContain("heartbeat.start();");
		expect(passiveFeedback).toContain("heartbeat.dispose();");

		expect(trajectory).toContain(
			"const disposeDispatchObservation = installCustomEventObservation({",
		);
		expect(trajectory).toContain("disposeDispatchObservation();");
		expect(trajectory).not.toContain(
			"window.addEventListener(UI_ACTION_DISPATCH_EVENT",
		);
		expect(trajectory).not.toContain(
			"window.removeEventListener(UI_ACTION_DISPATCH_EVENT",
		);
		expect(trajectory).toContain("if (stop) return stop;");
		expect(trajectory).toContain("stop = null;");
	});

	test("balanced onboarding storage observation delegates lifecycle ownership", () => {
		const onboarding = readSource("../Onboarding/types.ts");

		expect(onboarding).toContain("from '@forgeax/app-shell/react'");
		expect(onboarding).toContain(
			"const disposeStorageObservation = installStorageObservation({",
		);
		expect(onboarding).toContain("target: window,");
		expect(onboarding).toContain("onStorage: sync,");
		expect(onboarding).toContain("disposeStorageObservation();");
		expect(onboarding).not.toContain(
			"window.addEventListener('storage', sync)",
		);
		expect(onboarding).not.toContain(
			"window.removeEventListener('storage', sync)",
		);
		expect(onboarding).toContain(
			"const sync = () => setPhase(loadOnboarding().phase);",
		);
		expect(onboarding).toContain("disposeOnboardingObservation();");
	});

	test("balanced passive-feedback mutation observation delegates lifecycle ownership", () => {
		const passiveFeedback = readSource("../Feedback/PassiveFeedback.tsx");

		expect(passiveFeedback).toContain("from '@forgeax/app-shell/react'");
		expect(passiveFeedback).toContain(
			"const disposeMutationObservation = installMutationObservation({",
		);
		expect(passiveFeedback).toContain("target: document.body,");
		expect(passiveFeedback).toContain(
			"observerOptions: { childList: true, subtree: true },",
		);
		expect(passiveFeedback).toContain("onMutation: attach,");
		expect(passiveFeedback).toContain("disposeMutationObservation();");
		expect(passiveFeedback).not.toContain("new MutationObserver(attach)");
		expect(passiveFeedback).not.toContain("observer.disconnect()");
		expect(passiveFeedback).toContain(
			"slot.className = 'feedback-passive-chat-slot';",
		);
		expect(passiveFeedback).toContain("slot?.remove();");
	});

	test("balanced extension message subscriptions delegate lifecycle ownership", () => {
		const iframeHost = readSource("../ExtensionHost/ExtensionIframeHost.tsx");
		const editorBridge = readSource("./extension-editor-bridge.ts");

		for (const source of [iframeHost, editorBridge]) {
			expect(source).toContain("from '@forgeax/app-shell/react'");
			expect(source).toContain("installWindowMessageObservation");
		}

		expect(iframeHost).toContain(
			"const disposeWindowMessageObservation = installWindowMessageObservation({",
		);
		expect(iframeHost).toContain("onMessage: onRawMessage,");
		expect(iframeHost).toContain("disposeWindowMessageObservation();");
		expect(iframeHost).not.toContain(
			"window.addEventListener('message', onRawMessage)",
		);
		expect(iframeHost).not.toContain(
			"window.removeEventListener('message', onRawMessage)",
		);
		expect(iframeHost).toContain("iframe.addEventListener('load', onLoad)");
		expect(iframeHost).toContain("iframe.removeEventListener('load', onLoad)");
		expect(iframeHost).toContain("ev.origin !== messageOrigin");
		expect(iframeHost).toContain("ev.source !== iframe.contentWindow");

		expect(editorBridge).toContain(
			"const disposeWindowMessageObservation = installWindowMessageObservation({",
		);
		expect(editorBridge).toContain("target: options.ownerWindow,");
		expect(editorBridge).toContain("onMessage,");
		expect(editorBridge).toContain("disposeWindowMessageObservation();");
		expect(editorBridge).not.toContain(
			"options.ownerWindow.addEventListener('message', onMessage)",
		);
		expect(editorBridge).not.toContain(
			"options.ownerWindow.removeEventListener('message', onMessage)",
		);
		expect(editorBridge).toContain(
			"if (options.isTrustedEvent && !options.isTrustedEvent(event)) return;",
		);
		expect(editorBridge).toContain("disposed = true;");
	});

	test("global shortcuts delegate routing and share transient ownership", () => {
		const source = readSource("../../lib/global-shortcuts.ts");
		expect(source).toContain("from '@forgeax/app-shell/application'");
		expect(source).toContain("installApplicationKeyboardRouter({");
		expect(source).toContain(
			"registerApplicationKeydownHandler as registerGlobalKeydownHandler",
		);
		expect(source).not.toContain("new Set<GlobalKeydownHandler>");
		expect(source).not.toContain("keybindings.handle(");
	});

	test("cross-realm factories use the Extension Platform transport boundary", () => {
		const renderers = readSource("./panelRenderers.ts");
		const host = readSource("../ExtensionHost/ExtensionIframeHost.tsx");

		expect(renderers).toMatch(
			/export type\s*\{[\s\S]*\bPanelRenderers\b[\s\S]*\}\s*from ["']@forgeax\/app-shell\/application["']/,
		);
		expect(renderers).not.toContain("interface PanelRenderers");
		expect(renderers).not.toContain("type HostFactory");
		expect(host).toContain(
			"const { extensionTransport } = usePanelRenderers()",
		);
		expect(renderers).not.toContain("hostSDK");
		expect(host).not.toContain("hostSDK");
	});

	test("generic panel surface presentation belongs to App Shell", () => {
		const appCss = readSource("../../App.css");
		const panelCss = readSource("../PanelShell/PanelShell.css");

		expect(appCss).toContain("@import '@forgeax/app-shell/panel.css';");
		expect(panelCss).not.toMatch(/(^|\n)\.fx-panel\s*\{/);
		expect(panelCss).not.toMatch(/(^|\n)\.fx-panel-content\s*\{/);
		expect(panelCss).toContain(".fx-panel-header");
	});

	test("Interface application shell consumes slot diagnostics from App Shell directly", () => {
		const shell = readSource("../../ApplicationShell.tsx");

		expect(shell).toContain("from '@forgeax/app-shell/react'");
		expect(shell).not.toContain("from './components/SlotDebugOverlay'");
	});

	test("Interface keeps one compatibility App wrapper around a reusable application shell", () => {
		const app = readSource("../../App.tsx");
		const application = readSource("../../application.ts");
		const shell = readSource("../../ApplicationShell.tsx");
		const packageJson = JSON.parse(readSource("../../../package.json")) as {
			exports?: Record<
				string,
				{ types?: string; browser?: string; import?: string }
			>;
		};

		expect(app).toContain("from '@forgeax/app-shell/application'");
		expect(app).toContain("<ApplicationRuntimeRoot");
		expect(app).toContain("<ApplicationShell");
		expect(app).not.toContain("bootstrapAppHost(");
		expect(app).not.toContain("<HostProvider");
		expect(application).toContain(
			"export async function startInterfaceApplication",
		);
		expect(application).toContain("await bootstrapAppHost(overrides)");
		expect(application).toContain("bootStageAppMounted();");
		expect(shell).toContain("export function ApplicationShell");
		expect(shell).not.toContain("bootstrapAppHost(");
		expect(shell).not.toContain("<HostProvider");
		expect(packageJson.exports?.["./*"]).toEqual({
			types: "./dist/package/browser/*.d.ts",
			browser: "./dist/package/browser/*.js",
			import: "./dist/package/node/*.js",
		});
	});

	test("generic resize presentation belongs to App Shell", () => {
		const css = readSource("../../App.css");

		expect(css).toContain("@import '@forgeax/app-shell/resize.css';");
		expect(css).not.toMatch(/(^|\n)\.resize-handle\s*\{/);
		expect(css).not.toMatch(/(^|\n)\.resize-handle-(?:col|row)\s*\{/);
		expect(css).toMatch(
			/\.studio-shell\[data-fullscreen=['"]1['"]\]\s*>\s*\.studio-body\s*>\s*\.resize-handle-col/,
		);
	});

	test("DockRegion delegates anchored resize sessions while retaining product-owned shell size configuration", () => {
		const dockRegion = readSource("./DockRegion.tsx");
		const localAnchoredResize = fileURLToPath(
			new URL("./anchoredResize.ts", import.meta.url),
		);
		const localAnchoredResizeTest = fileURLToPath(
			new URL("./anchoredResize.test.ts", import.meta.url),
		);

		expect(dockRegion.match(/<AnchoredResizeHandle/g)).toHaveLength(2);
		expect(dockRegion).toContain("from '@forgeax/app-shell/react'");
		expect(dockRegion).not.toContain("from './AuxBarResizer'");
		expect(dockRegion).not.toContain("from './ChatDockResizer'");
		expect(dockRegion).not.toContain("from './anchoredResize'");
		expect(existsSync(localAnchoredResize)).toBe(false);
		expect(existsSync(localAnchoredResizeTest)).toBe(false);
		expect(dockRegion).toContain('className="fx-auxbar-resizer"');
		expect(dockRegion).toContain('className="fx-chat-resizer"');
		expect(dockRegion).toContain('resizingBodyClassName="fx-auxbar-resizing"');
		expect(dockRegion).toContain('resizingBodyClassName="fx-chat-resizing"');
		expect(dockRegion).toContain("readSize={auxBarWidthStore.getSnapshot}");
		expect(dockRegion).toContain("writeSize={auxBarWidthStore.setSize}");
		expect(dockRegion).toContain("readSize={chatWidthStore.getSnapshot}");
		expect(dockRegion).toContain("writeSize={chatWidthStore.setSize}");
		expect(dockRegion).not.toContain("auxResizeRef");
		expect(dockRegion).not.toContain("chatResizeRef");
		expect(dockRegion).not.toContain("beginAnchoredResize");
		expect(dockRegion).not.toContain("applyAnchoredResizeDelta");
		expect(dockRegion).not.toContain("document.body.classList");
	});

	test("DrawerHostView delegates its anchored resize session while retaining drawer policy", () => {
		const drawerHost = readSource("../Drawer/DrawerHostView.tsx");
		const drawerCss = readSource("../Drawer/DrawerHostView.css");

		expect(drawerHost).toContain("AnchoredResizeHandle,");
		expect(drawerHost).toContain("from '@forgeax/app-shell/react';");
		expect(drawerHost).toContain("<AnchoredResizeHandle");
		expect(drawerHost).toContain('orientation="row"');
		expect(drawerHost).toContain('direction="subtract"');
		expect(drawerHost).toContain('className="fx-drawer-resizer"');
		expect(drawerHost).toContain(
			"readSize={() => useDrawerStore.getState().height}",
		);
		expect(drawerHost).toContain("writeSize={setHeight}");
		expect(drawerHost).toContain('resizingBodyClassName="fx-drawer-resizing"');
		expect(drawerHost).not.toContain("setPointerCapture");
		expect(drawerHost).not.toContain("releasePointerCapture");
		expect(drawerHost).not.toContain("document.body.classList");
		expect(drawerHost).not.toContain("startYRef");
		expect(drawerHost).not.toContain("startHRef");
		expect(drawerCss).toMatch(/\.fx-drawer-resizer\s*\{[^}]*margin:\s*0;/s);
		expect(drawerCss).toMatch(
			/\.resize-handle\.fx-drawer-resizer::after\s*\{[^}]*content:\s*none;/s,
		);
	});

	test("DrawerHostView delegates body and viewport resize observation while retaining inset geometry policy", () => {
		const drawerHost = readSource("../Drawer/DrawerHostView.tsx");

		expect(drawerHost).toContain("installElementResizeObservation,");
		expect(drawerHost).toContain("installViewportResizeObservation,");
		expect(drawerHost).toContain(
			"const disposeBodyResize = installElementResizeObservation({",
		);
		expect(drawerHost).toContain("getElements: () => [document.body],");
		expect(drawerHost).toContain(
			"const disposeViewportResize = installViewportResizeObservation({",
		);
		expect(drawerHost).toContain("onResize: measure,");
		expect(drawerHost).toContain("document.querySelector('.activity-rail')");
		expect(drawerHost).toContain(
			"Math.max(0, Math.round(window.innerWidth - rect.left))",
		);
		expect(drawerHost).toContain("disposeViewportResize();");
		expect(drawerHost).toContain("disposeBodyResize();");
		expect(drawerHost).not.toContain("new ResizeObserver");
		expect(drawerHost).not.toContain("window.addEventListener('resize'");
	});

	test("edge drawer delegates imperative pointer-drag ownership while retaining product geometry policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installPointerDragSession,");
		expect(edgeDrawer).toContain("from '@forgeax/app-shell/react';");
		expect(edgeDrawer).toContain(
			"const disposeGripResize = installPointerDragSession({",
		);
		expect(edgeDrawer).toContain("element: grip");
		expect(edgeDrawer).toContain(
			"draggingClassName: 'fx-edge-drawer-grip--dragging'",
		);
		expect(edgeDrawer).toContain("preventDefault: true");
		expect(edgeDrawer).toContain("stopPropagation: true");
		expect(edgeDrawer).toContain("const edge = edgeOf(group)");
		expect(edgeDrawer).toContain("group.element.getBoundingClientRect()");
		expect(edgeDrawer).toContain("Math.max(160, Math.min(size, 900))");
		expect(edgeDrawer).toContain(
			"group.element.style.setProperty(sizeVar(edge), `${size}px`)",
		);
		expect(edgeDrawer).toContain("positionGrip(group)");
		expect(edgeDrawer).toContain("disposeGripResize();");
		expect(edgeDrawer).not.toContain("grip.setPointerCapture");
		expect(edgeDrawer).not.toContain("grip.releasePointerCapture");
		expect(edgeDrawer).not.toContain("grip.addEventListener('pointermove'");
		expect(edgeDrawer).not.toContain("grip.addEventListener('pointerup'");
		expect(edgeDrawer).not.toContain(
			"grip.classList.add('fx-edge-drawer-grip--dragging')",
		);
		expect(edgeDrawer).not.toContain(
			"grip.classList.remove('fx-edge-drawer-grip--dragging')",
		);
	});

	test("edge drawer delegates dismiss-exempt target matching while retaining host selectors and drawer policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("isDismissExemptInteractionTarget");
		expect(edgeDrawer).toContain("from '@forgeax/app-shell/react'");
		expect(edgeDrawer).toContain("'.forgeax-ctx-menu-panel'");
		expect(edgeDrawer).toContain("'.dv-context-menu'");
		expect(edgeDrawer).toContain("EDGE_DRAWER_DISMISS_EXEMPT_SELECTORS");
		expect(edgeDrawer).toContain("isDismissExemptInteractionTarget(");
		expect(edgeDrawer).not.toContain(
			"const EDGE_DRAWER_INTERACTION_SURFACE_SELECTOR = '[data-fx-interaction-scope]'",
		);
		expect(edgeDrawer).not.toContain("return target?.closest(");
	});

	test("edge drawer delegates outside-dismiss listener lifecycle while retaining product policy adapters", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installOutsideDismissLifecycle,");
		expect(edgeDrawer).toContain(
			"const disposeOutsideDismiss = installOutsideDismissLifecycle({",
		);
		expect(edgeDrawer).toContain("isOpen: () => openGroup !== null");
		expect(edgeDrawer).toContain(
			"isPinned: () => !!openGroup && activeIsPinned(openGroup)",
		);
		expect(edgeDrawer).toContain("isEdgeDrawerDismissExemptTarget");
		expect(edgeDrawer).toMatch(
			/if\s*\(openGroup\s*&&\s*!activeIsPinned\(openGroup\)\)\s*preserveNextActiveTabClick\s*=\s*false;/,
		);
		expect(edgeDrawer).toContain(
			"preserveNextActiveTabClick = hasOwnedInteractionSurface()",
		);
		expect(edgeDrawer).toContain("disposeOutsideDismiss();");
		expect(edgeDrawer).not.toContain("const onPointerDownCapture");
		expect(edgeDrawer).not.toContain("const dismissIfFocusEscapedTo");
		expect(edgeDrawer).not.toContain("const onFocusInCapture");
		expect(edgeDrawer).not.toContain("const onWindowBlur");
		expect(edgeDrawer).not.toContain("document.addEventListener('focusin'");
		expect(edgeDrawer).not.toContain(
			"window.addEventListener('blur', onWindowBlur",
		);
	});

	test("edge drawer delegates bounded footer-relocation retries and disposes pending frames", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installBoundedFrameRetryLifecycle,");
		expect(edgeDrawer).toContain(
			"const disposeFooterRelocationRetry = installBoundedFrameRetryLifecycle({",
		);
		expect(edgeDrawer).toContain("attempt: () => {");
		expect(edgeDrawer).toContain("relocateBottomStrip();");
		expect(edgeDrawer).toContain("bottomStripEl.parentElement === host");
		expect(edgeDrawer).toContain("onSuccess: syncEmptyEdges");
		expect(edgeDrawer).toContain("maxFrames: 242");
		expect(edgeDrawer).toContain("disposeFooterRelocationRetry();");
		expect(edgeDrawer).not.toContain("let relocateTries = 0");
		expect(edgeDrawer).not.toContain("const relocateRetry = (): void =>");
		expect(edgeDrawer).not.toContain("requestAnimationFrame(relocateRetry)");
	});

	test("edge drawer delegates coalesced footer-relocation frame scheduling", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("createCoalescedFrameTaskLifecycle,");
		expect(edgeDrawer).toContain(
			"const footerRelocationFrame = createCoalescedFrameTaskLifecycle({",
		);
		expect(edgeDrawer).toContain("task: () => relocateBottomStrip()");
		expect(edgeDrawer).toContain(
			"const scheduleRelocate = footerRelocationFrame.schedule;",
		);
		expect(edgeDrawer).toContain("footerRelocationFrame.dispose();");
		expect(edgeDrawer).not.toContain("let relocateRaf = 0");
		expect(edgeDrawer).not.toContain("relocateRaf = requestAnimationFrame");
		expect(edgeDrawer).not.toContain("cancelAnimationFrame(relocateRaf)");
	});

	test("edge drawer delegates HTML5 drag-presence lifecycle while retaining product target and UI effects", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installDragPresenceLifecycle,");
		expect(edgeDrawer).toContain(
			"const disposeDragPresence = installDragPresenceLifecycle({",
		);
		expect(edgeDrawer).toContain("target?.closest?.('.dv-tab')");
		expect(edgeDrawer).toContain(
			"target?.closest?.('.dv-tabs-and-actions-container')",
		);
		expect(edgeDrawer).toContain(
			"document.documentElement.classList.toggle(DRAG_CLASS, active)",
		);
		expect(edgeDrawer).toContain("if (!active) clearDropAnchor();");
		expect(edgeDrawer).toContain("onDragOver: (eventTarget) => {");
		expect(edgeDrawer).toContain("if (!dropAnchorModel) return;");
		expect(edgeDrawer).toContain(
			"if (overBottomStrip(eventTarget as Node | null)) return;",
		);
		expect(edgeDrawer).toContain("disposeDragPresence();");
		expect(edgeDrawer).not.toContain("const onAnyDragStart");
		expect(edgeDrawer).not.toContain("const onAnyDragOver");
		expect(edgeDrawer).not.toContain("const clearDragClass");
		expect(edgeDrawer).not.toContain("window.addEventListener('dragstart'");
		expect(edgeDrawer).not.toContain("window.addEventListener('dragover'");
		expect(edgeDrawer).not.toContain("window.addEventListener('dragend'");
		expect(edgeDrawer).not.toContain("window.addEventListener('drop'");
		expect(edgeDrawer).not.toContain("window.removeEventListener('dragstart'");
		expect(edgeDrawer).not.toContain("window.removeEventListener('dragover'");
		expect(edgeDrawer).not.toContain("window.removeEventListener('dragend'");
		expect(edgeDrawer).not.toContain("window.removeEventListener('drop'");
	});

	test("edge drawer delegates viewport resize observation while retaining reposition policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installViewportResizeObservation,");
		expect(edgeDrawer).toContain(
			"const disposeViewportResize = installViewportResizeObservation({",
		);
		expect(edgeDrawer).toContain("onResize: reposition,");
		expect(edgeDrawer).toContain("disposeViewportResize();");
		expect(edgeDrawer).not.toContain(
			"window.addEventListener('resize', reposition)",
		);
		expect(edgeDrawer).not.toContain(
			"window.removeEventListener('resize', reposition)",
		);
	});

	test("edge drawer delegates command-event observation while retaining product command policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installCustomEventObservation,");
		expect(edgeDrawer).toContain(
			"const disposeCommandObservation = installCustomEventObservation({",
		);
		expect(edgeDrawer).toContain("eventType: 'forgeax:edge-drawer',");
		expect(edgeDrawer).toContain("onEvent: onEdgeDrawerCmd,");
		expect(edgeDrawer).toContain("disposeCommandObservation();");
		expect(edgeDrawer).toContain("detail.action === 'close'");
		expect(edgeDrawer).toContain("detail.action === 'toggle'");
		expect(edgeDrawer).not.toContain(
			"window.addEventListener('forgeax:edge-drawer'",
		);
		expect(edgeDrawer).not.toContain(
			"window.removeEventListener('forgeax:edge-drawer'",
		);
	});

	test("edge drawer delegates capture interaction observation while retaining product click policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installCaptureInteractionObservation,");
		expect(edgeDrawer).toContain(
			"const disposeCaptureInteraction = installCaptureInteractionObservation({",
		);
		expect(edgeDrawer).toContain("onPointerDown: onStripChromePointerDown,");
		expect(edgeDrawer).toContain("onClick: onClickCapture,");
		expect(edgeDrawer).toContain("disposeCaptureInteraction();");
		expect(edgeDrawer).toContain("preserveNextActiveTabClick = false;");
		expect(edgeDrawer).toContain("target?.closest(`.${EDGE_PIN_CLASS}`)");
		expect(edgeDrawer).not.toContain(
			"document.addEventListener('pointerdown', onStripChromePointerDown",
		);
		expect(edgeDrawer).not.toContain(
			"document.addEventListener('click', onClickCapture",
		);
		expect(edgeDrawer).not.toContain(
			"document.removeEventListener('pointerdown', onStripChromePointerDown",
		);
		expect(edgeDrawer).not.toContain(
			"document.removeEventListener('click', onClickCapture",
		);
	});

	test("edge drawer delegates replaceable collapse observation while retaining collapse policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("createReplaceableObservationSetLifecycle,");
		expect(edgeDrawer).toContain(
			"const collapseObservation = createReplaceableObservationSetLifecycle",
		);
		expect(edgeDrawer).toContain(
			"subscribe: (group, listener) => group.api.onDidCollapsedChange(listener),",
		);
		expect(edgeDrawer).toContain("onObservation: (group, event) => {");
		expect(edgeDrawer).toMatch(
			/if\s*\(!event\.isCollapsed\)\s*\{\s*try\s*\{\s*group\.api\.collapse\(\);\s*}\s*catch\s*\{\s*\/\* noop \*\/\s*}\s*}/,
		);
		expect(edgeDrawer).toContain(
			"collapseObservation.replace(edgeGroups(api));",
		);
		expect(edgeDrawer).toContain("collapseObservation.dispose();");
		expect(edgeDrawer).not.toContain("const collapseGuards");
		expect(edgeDrawer).not.toContain("collapseGuards.push");
	});

	test("edge drawer delegates panel-membership observation while retaining reconciliation policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installPanelMembershipObservation,");
		expect(edgeDrawer).toContain(
			"const disposePanelMembershipObservation = installPanelMembershipObservation({",
		);
		expect(edgeDrawer).toContain(
			"subscribeAdd: (listener) => api.onDidAddPanel(listener),",
		);
		expect(edgeDrawer).toContain(
			"subscribeRemove: (listener) => api.onDidRemovePanel(listener),",
		);
		expect(edgeDrawer).toMatch(
			/onAdd:\s*\(\)\s*=>\s*\{\s*if\s*\(ensuringFooter\)\s*return;\s*relocateBottomStrip\(\);\s*syncEmptyEdges\(\);\s*},/,
		);
		expect(edgeDrawer).toMatch(
			/onRemove:\s*\(\)\s*=>\s*\{\s*syncEmptyEdges\(\);\s*},/,
		);
		expect(edgeDrawer).toContain("disposePanelMembershipObservation();");
		expect(edgeDrawer).not.toContain("const addPanelSub");
		expect(edgeDrawer).not.toContain("const remPanelSub");
	});

	test("edge drawer delegates active-panel observation while retaining reconciliation policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installActivePanelObservation,");
		expect(edgeDrawer).toContain(
			"const disposeActivePanelObservation = installActivePanelObservation({",
		);
		expect(edgeDrawer).toContain(
			"subscribe: (listener) => api.onDidActivePanelChange(listener),",
		);
		expect(edgeDrawer).toMatch(
			/onChange:\s*\(\)\s*=>\s*\{\s*if\s*\(ensuringFooter\)\s*return;\s*relocateBottomStrip\(\);\s*syncBottomFocusMarker\(\);\s*},/,
		);
		expect(edgeDrawer).toContain("disposeActivePanelObservation();");
		expect(edgeDrawer).not.toContain("const activeSub");
	});

	test("edge drawer delegates layout-from-JSON observation while retaining hydration reconciliation policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installLayoutFromJsonObservation,");
		expect(edgeDrawer).toContain(
			"const disposeLayoutFromJsonObservation = installLayoutFromJsonObservation({",
		);
		expect(edgeDrawer).toContain(
			"subscribe: (listener) => api.onDidLayoutFromJSON(listener),",
		);
		expect(edgeDrawer).toContain("onHydrated: () => {");
		expect(edgeDrawer).toContain("ensureEdgeSlots();");
		expect(edgeDrawer).toContain("ensureFooterPanels();");
		expect(edgeDrawer).toContain("normalize();");
		expect(edgeDrawer).toContain("rebindCollapseGuards();");
		expect(edgeDrawer).toContain("relocateBottomStrip();");
		expect(edgeDrawer).toContain("syncEmptyEdges();");
		expect(edgeDrawer).toContain("disposeLayoutFromJsonObservation();");
		expect(edgeDrawer).not.toContain("const fromJsonSub");
	});

	test("edge drawer delegates will-drop observation while retaining root-edge drop policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain("installWillDropObservation,");
		expect(edgeDrawer).toMatch(
			/const\s+disposeWillDropObservation\s*=\s*installWillDropObservation<DockviewWillDropEvent>\(\{/,
		);
		expect(edgeDrawer).toContain(
			"subscribe: (listener) => api.onWillDrop(listener),",
		);
		expect(edgeDrawer).toContain("onWillDrop: (e) => {");
		expect(edgeDrawer).toContain("if (e.kind !== 'edge') return;");
		expect(edgeDrawer).toContain("e.preventDefault();");
		expect(edgeDrawer).toContain(
			"panel.api.moveTo({ group: edgeGroup, position: 'center' });",
		);
		expect(edgeDrawer).toContain("open(edgeGroup);");
		expect(edgeDrawer).toContain("syncEmptyEdges();");
		expect(edgeDrawer).toContain("disposeWillDropObservation();");
		expect(edgeDrawer).not.toContain("const willDropSub");
	});

	test("edge drawer delegates layout-change observation while retaining reconciliation policy", () => {
		const edgeDrawer = readSource("./edgeDrawer.ts");

		expect(edgeDrawer).toContain(
			"import { installDockLayoutObservation } from '@forgeax/app-shell/dock';",
		);
		expect(edgeDrawer).toMatch(
			/const\s+disposeLayoutChangeObservation\s*=\s*installDockLayoutObservation\s*\(\s*\{/,
		);
		expect(edgeDrawer).toMatch(
			/onDidLayoutChange:\s*\(listener\)\s*=>\s*api\.onDidLayoutChange\(listener\),/,
		);
		expect(edgeDrawer).toContain("getCurrentScope: () => null,");
		expect(edgeDrawer).toContain("onCommitted: () => {");
		expect(edgeDrawer).toContain("if (ensuringFooter) return;");
		expect(edgeDrawer).toContain("reposition();");
		expect(edgeDrawer).toContain("ensureEdgeSlots();");
		expect(edgeDrawer).toContain("ensureFooterPanels();");
		expect(edgeDrawer).toContain("normalize();");
		expect(edgeDrawer).toContain("rebindCollapseGuards();");
		expect(edgeDrawer).toContain("relocateBottomStrip();");
		expect(edgeDrawer).toContain("syncEmptyEdges();");
		expect(edgeDrawer).toContain("disposeLayoutChangeObservation();");
		expect(edgeDrawer).not.toContain("const layoutSub");
	});

	test("keep-alive surfaces delegate replaceable element resize observation while retaining layout policy", () => {
		const keepAlive = readSource("../Surfaces/SurfaceKeepAliveLayer.tsx");

		expect(keepAlive).toContain("installElementResizeObservation,");
		expect(keepAlive).toContain(
			"const disposeAnchorResizeObservation = installElementResizeObservation({",
		);
		expect(keepAlive).toMatch(
			/getElements:\s*\(\)\s*=>\s*ALL_KINDS\.map\(getAnchor\)\.filter\(/,
		);
		expect(keepAlive).toContain("subscribeElements: subscribeAnchors,");
		expect(keepAlive).toContain("onResize: scheduleSync,");
		expect(keepAlive).toContain("onElementsChanged: syncLayout,");
		expect(keepAlive).toContain("disposeAnchorResizeObservation();");
		expect(keepAlive).not.toContain("new ResizeObserver");
		expect(keepAlive).not.toContain("const observeCurrentAnchors");
		expect(keepAlive).not.toContain("const offAnchors");
		expect(keepAlive).toContain("mapViewportRectToOverlayRoot");
		expect(keepAlive).toContain("el.style.left = '-100000px'");
		expect(keepAlive).toContain("host.bus.emit('panel:focus'");
	});

	test("keep-alive surfaces delegate frame coalescing and viewport resize observation while retaining settle policy", () => {
		const keepAlive = readSource("../Surfaces/SurfaceKeepAliveLayer.tsx");

		expect(keepAlive).toContain("createCoalescedFrameTaskLifecycle,");
		expect(keepAlive).toContain("installViewportResizeObservation,");
		expect(keepAlive).toContain(
			"const layoutFrameTask = createCoalescedFrameTaskLifecycle({",
		);
		expect(keepAlive).toContain("task: syncLayout,");
		expect(keepAlive).toContain(
			"const scheduleSync = layoutFrameTask.schedule;",
		);
		expect(keepAlive).toContain(
			"const disposeWindowResizeObservation = installViewportResizeObservation({",
		);
		expect(keepAlive).toContain("target: window,");
		expect(keepAlive).toContain(
			"const disposeVisualViewportResizeObservation = visualViewport",
		);
		expect(keepAlive).toContain("target: visualViewport,");
		expect(keepAlive).toContain("disposeWindowResizeObservation();");
		expect(keepAlive).toContain("disposeVisualViewportResizeObservation();");
		expect(keepAlive).toContain("layoutFrameTask.dispose();");
		expect(keepAlive).not.toContain("window.addEventListener('resize', onWin)");
		expect(keepAlive).not.toContain(
			"window.removeEventListener('resize', onWin)",
		);
		expect(keepAlive).toContain("installViewportScrollObservation,");
		expect(keepAlive).toContain(
			"const disposeViewportScrollObservation = installViewportScrollObservation({",
		);
		expect(keepAlive).toContain("onScroll: onWin,");
		expect(keepAlive).toContain("disposeViewportScrollObservation();");
		expect(keepAlive).not.toContain("window.addEventListener('scroll'");
		expect(keepAlive).not.toContain("window.removeEventListener('scroll'");
		expect(keepAlive).toContain(
			"const settleTimers = Array.from({ length: SETTLE_TICKS }",
		);
		expect(keepAlive).toContain("createRestartableTimeoutTaskLifecycle,");
		expect(keepAlive).toContain("const SETTLE_TICKS = 4;");
		expect(keepAlive).toContain("const SETTLE_STEP_MS = 60;");
	});

	test("guided overlays delegate viewport resize observation while retaining product geometry and scroll policy", () => {
		const tourOverlay = readSource("../TourOverlay/TourOverlay.tsx");
		const publishOnboarding = readSource("../TopBar/PublishOnboarding.tsx");

		for (const source of [tourOverlay, publishOnboarding]) {
			expect(source).toContain("installViewportResizeObservation,");
			expect(source).toContain(
				"const disposeViewportResizeObservation = installViewportResizeObservation({",
			);
			expect(source).toContain("target: window,");
			expect(source).toContain("disposeViewportResizeObservation();");
			expect(source).not.toContain("window.addEventListener('resize'");
			expect(source).not.toContain("window.removeEventListener('resize'");
		}

		expect(tourOverlay).toContain("installViewportScrollObservation,");
		expect(tourOverlay).toMatch(
			/const\s+disposeViewportScrollObservation\s*=\s*installViewportScrollObservation\(\{/,
		);
		expect(tourOverlay).toContain("onScroll: onWin,");
		expect(tourOverlay).toContain("disposeViewportScrollObservation();");
		expect(tourOverlay).not.toContain("window.addEventListener('scroll'");
		expect(tourOverlay).not.toContain("window.removeEventListener('scroll'");
		expect(tourOverlay).toContain("readAnchorRect(anchorKey.split('|'))");
		expect(tourOverlay).toMatch(
			/createRestartableTimeoutTaskLifecycle\(\{\s*delayMs:\s*60,\s*task:\s*tick,?\s*}\)/,
		);
		expect(tourOverlay).toContain("if (rect || attempts >= 20) return");
		expect(tourOverlay).toContain("retry.schedule()");
		expect(tourOverlay).toContain("retry.dispose()");

		expect(publishOnboarding).toContain("setMenuOpen(step.menu);");
		expect(publishOnboarding).toContain("setGeo(compute(el, step));");
		expect(publishOnboarding).toMatch(
			/createRestartableTimeoutTaskLifecycle\(\{\s*task:\s*run,\s*delayMs:\s*45,?\s*}\)/,
		);
	});

	test("page overflow and panel folding delegate fixed-element resize observation while retaining product policy", () => {
		const pageTabs = readSource("../PageTabs/PageTabStrip.tsx");
		const panelShell = readSource("../PanelShell/PanelShell.tsx");

		expect(pageTabs).toContain("installElementResizeObservation,");
		expect(pageTabs).toContain("return installElementResizeObservation({");
		expect(pageTabs).toContain("getElements: () => [el],");
		expect(pageTabs).toContain("onResize: measure,");
		expect(pageTabs).toContain("el.scrollWidth - el.clientWidth > 1");
		expect(pageTabs).not.toContain("new ResizeObserver");

		expect(panelShell).toContain("installElementResizeObservation,");
		expect(panelShell).toContain(
			"const disposeResizeObservation = installElementResizeObservation({",
		);
		expect(panelShell).toMatch(
			/getElements:\s*\(\)\s*=>\s*\[headerRef\.current,\s*measureRef\.current\]\.filter\(/,
		);
		expect(panelShell).toContain("onResize: schedule,");
		expect(panelShell).toContain("disposeResizeObservation();");
		expect(panelShell).toContain("createCoalescedFrameTaskLifecycle,");
		expect(panelShell).toContain(
			"const foldingFrameTask = createCoalescedFrameTaskLifecycle({",
		);
		expect(panelShell).toContain("task: recompute,");
		expect(panelShell).toContain("const schedule = foldingFrameTask.schedule;");
		expect(panelShell).toContain("foldingFrameTask.dispose();");
		expect(panelShell).not.toContain("requestAnimationFrame(recompute)");
		expect(panelShell).not.toContain("cancelAnimationFrame(raf)");
		expect(panelShell).toContain("setFoldCount(next);");
		expect(panelShell).not.toContain("new ResizeObserver");
	});

	test("UE drag delegates threshold arming while retaining Dockview and product drop policy", () => {
		const controller = readSource("./ueDrag/controller.ts");

		expect(controller).toContain(
			"import { installThresholdPointerDragSession } from '@forgeax/app-shell/react';",
		);
		expect(controller).toContain(
			"const lifecycle = installThresholdPointerDragSession({",
		);
		expect(controller).toContain("pointerId: event.pointerId");
		expect(controller).toContain("threshold: DRAG_THRESHOLD");
		expect(controller).toContain("begin: () => {");
		expect(controller).toContain("beginDrag(api, panel, ctx);");
		expect(controller).toMatch(
			/move:\s*\(_active,\s*pointer\)\s*=>\s*updateDrag\(\{/,
		);
		expect(controller).toMatch(
			/registerCancel:\s*\(cancel\)\s*=>\s*registerGlobalKeydownHandler/,
		);
		expect(controller).toContain("commit();");
		expect(controller).toContain("compactAfterUeDragCommit(s);");
		expect(controller).toContain("compactEmptyDockGroups");
		expect(controller).toContain("target.closest('.dv-tab')");
		expect(controller).not.toContain("window.addEventListener('pointermove'");
		expect(controller).not.toContain("window.addEventListener('pointerup'");
		expect(controller).not.toContain(
			"window.removeEventListener('pointermove'",
		);
		expect(controller).not.toContain("window.removeEventListener('pointerup'");
	});

	test("page tabs delegate pointer reorder lifecycle while retaining page identity and mutation policy", () => {
		const pageTabs = readSource("../PageTabs/PageTabStrip.tsx");

		expect(pageTabs).toContain("installPointerReorderSession,");
		expect(pageTabs).toContain("from '@forgeax/app-shell/react';");
		expect(pageTabs).toContain(
			"const lifecycle = installPointerReorderSession({",
		);
		expect(pageTabs).toContain("closest<HTMLElement>('[data-page-key]')");
		expect(pageTabs).toContain("closest('[data-page-close]')");
		expect(pageTabs).toMatch(
			/host\.pages\s*\.getSnapshot\(\)\s*\.instances\s*\.findIndex/,
		);
		expect(pageTabs).toContain("host.pages.reorder(draggedKey, toIndex);");
		expect(pageTabs).toContain("onDraggingChange: setDraggingKey");
		expect(pageTabs).toContain("const hasTabs = instances.length > 0;");
		expect(pageTabs).toMatch(/},\s*\[host,\s*hasTabs\]\);/);
		expect(pageTabs).not.toContain("dragKeyRef");
		expect(pageTabs).not.toContain("window.addEventListener('pointerup'");
		expect(pageTabs).not.toContain("onPointerMove={");
		expect(pageTabs).not.toContain("onPointerDown={(e) => handlePointerDown");
	});

	test("persistent shell-size state belongs to App Shell while Interface keeps product configuration", () => {
		const auxBarWidth = readSource("./useAuxBarWidth.ts");
		const chatWidth = readSource("../ChatColumn/useChatWidth.ts");

		for (const source of [auxBarWidth, chatWidth]) {
			expect(source).toContain("from '@forgeax/app-shell/react'");
			expect(source).toContain("createPersistentSizeStore");
			expect(source).toContain("usePersistentSizeStore");
			expect(source).not.toContain("from 'zustand'");
			expect(source).not.toContain("localStorage");
			expect(source).not.toMatch(/function (?:loadPersisted|persist|clamp)/);
		}
		expect(auxBarWidth).toContain("storageKey: 'forgeax:auxbar-width'");
		expect(auxBarWidth).toContain("defaultSize: AUXBAR_DEFAULT_WIDTH");
		expect(auxBarWidth).toContain("minSize: AUXBAR_MIN_WIDTH");
		expect(auxBarWidth).toContain("maxSize: AUXBAR_MAX_WIDTH");
		expect(chatWidth).toContain("storageKey: 'forgeax:chat-width'");
		expect(chatWidth).toContain("defaultSize: CHAT_DEFAULT_WIDTH");
		expect(chatWidth).toContain("minSize: CHAT_MIN_WIDTH");
		expect(chatWidth).toContain("maxSize: CHAT_MAX_WIDTH");
	});

	test("DockRegion and product commands consume public dock state adapters", () => {
		const dockRegion = readSource("./DockRegion.tsx");
		const commands = readSource("../../core/extensions/builtin-commands.ts");
		const menus = readSource("../../core/extensions/builtin-menus.ts");

		expect(dockRegion).toContain("from '@forgeax/app-shell/dock'");
		expect(dockRegion).toContain("hasMountedPanelPlacement");
		expect(dockRegion).toContain("pruneSerializedDockLayout");
		expect(dockRegion).toContain("installDockPanelVisibilityTracking");
		expect(dockRegion).toContain("createDockPanelCommands");
		expect(dockRegion).toContain("scopeTransition.getCurrent()?.layout");
		expect(dockRegion).not.toContain("from './reopen-position'");
		expect(dockRegion).not.toContain("const visiblePanelIds");
		expect(dockRegion).not.toContain("export function isPanelVisible");
		expect(commands).toContain(
			"import { isDockPanelVisible } from '@forgeax/app-shell/dock'",
		);
		expect(menus).toContain(
			"import { isDockPanelVisible } from '@forgeax/app-shell/dock'",
		);
		expect(commands).not.toContain(
			"from '../../components/DockShell/DockRegion'",
		);
		expect(menus).not.toContain("from '../../components/DockShell/DockRegion'");
	});

	test("DockRegion delegates layout-control React presentation ownership", () => {
		const dockRegion = readSource("./DockRegion.tsx");

		expect(dockRegion).toContain("DockLayoutMenu");
		expect(dockRegion).toContain("createDockLayoutControlState");
		expect(dockRegion).toContain("layoutControl.refresh()");
		expect(dockRegion).toContain("host.bus.on('dock:layout-toggle'");
		expect(dockRegion).not.toContain("useDockLayoutControlBinding");
		expect(dockRegion).not.toContain("<FloatingMenu");
		// The carrier and ordinary menu rows stay in App Shell; Interface injects
		// only its Viewport-specific action through the public extension slot.
		expect(dockRegion).toContain("renderPanelActions={(panel) =>");
		expect(dockRegion).toContain('className="fx-dl-item');
		expect(dockRegion).not.toContain('className="fx-dl-sep"');
		expect(dockRegion).not.toContain('className="fx-dl-head"');
		expect(dockRegion).not.toContain("createDockLayoutPanelControl({");
		expect(dockRegion).not.toContain("installDockLayoutControlToggle({");
		expect(dockRegion).not.toContain("layoutRevision");
		expect(dockRegion).not.toContain("revision: _revision");
		expect(dockRegion).not.toContain("const [open, setOpen] = useState(false)");
		expect(dockRegion).not.toContain("const [anchor, setAnchor] = useState");
		expect(dockRegion).not.toContain(
			"const isOpen = Boolean(getApi()?.getPanel(panel.id))",
		);
		expect(dockRegion).not.toContain(
			"if (isOpen) getApi()?.getPanel(panel.id)?.api.close(); else onReopen(panel.id)",
		);
	});

	test("DockRegion delegates the generic floating-menu carrier to App Shell", () => {
		const dockRegion = readSource("./DockRegion.tsx");
		const localFloatingMenu = fileURLToPath(
			new URL("../ui/FloatingMenu.tsx", import.meta.url),
		);

		expect(dockRegion).toContain("DockLayoutMenu");
		expect(dockRegion).toContain("from '@forgeax/app-shell/react'");
		expect(dockRegion).not.toContain("FloatingMenu");
		expect(dockRegion).not.toContain("from '../ui/FloatingMenu'");
		expect(existsSync(localFloatingMenu)).toBe(false);
	});

	test("DockRegion delegates visibility lease lifecycle while retaining ChatDock UI state", () => {
		const dockRegion = readSource("./DockRegion.tsx");

		expect(dockRegion).toContain("installDockPanelVisibilityTracking(api, {");
		expect(dockRegion).toMatch(
			/onAdded:\s*\(id\)\s*=>\s*\{\s*if\s*\(region\s*===\s*'ChatDock'\s*&&\s*id\s*===\s*'chat'\)\s*setChatMounted\(true\);\s*}/,
		);
		expect(dockRegion).toMatch(
			/onRemoved:\s*\(id\)\s*=>\s*\{\s*if\s*\(region\s*===\s*'ChatDock'\s*&&\s*id\s*===\s*'chat'\)\s*setChatMounted\(false\);\s*}/,
		);
		expect(dockRegion).not.toContain("visibilityReleases");
		expect(dockRegion).not.toContain("trackDockPanelVisibility");
	});

	test("DockRegion delegates ready-session teardown while retaining concrete adapter order", () => {
		const dockRegion = readSource("./DockRegion.tsx");

		expect(dockRegion).toContain("createDockReadyActivation<DockviewApi>()");
		expect(dockRegion).toContain(
			"const activated = readyActivation.replace(api, [",
		);
		expect(dockRegion).toContain("() => registerDockviewApi(api)");
		expect(dockRegion).toMatch(/\(\)\s*=>\s*registerDockRegion\(/);
		expect(dockRegion).toMatch(
			/\(\)\s*=>\s*installDockPanelVisibilityTracking\(api,\s*\{/,
		);
		expect(dockRegion).toContain(
			"getTabContextMenuItems={getTabContextMenuItems}",
		);
		expect(dockRegion).not.toContain("installDockOverlayHost");
		expect(dockRegion).toContain("() => installEdgeDrawer(api, wrap)");
		expect(dockRegion).toMatch(
			/\(\)\s*=>\s*installUeDockDrag\(api,\s*wrap,\s*\{/,
		);
		expect(dockRegion).toContain(
			"createDockScopeTransition<ActivePageScope, DockviewApi>",
		);
		expect(dockRegion).toContain(
			"if (activated) scopeTransition.applyCurrent()",
		);
		expect(dockRegion).toContain("scopeTransition.transition(pageScope)");
		expect(dockRegion).toContain("scopeTransition.getCurrent()");
		expect(dockRegion).toContain("readyActivation.getCurrent()");
		expect(dockRegion).toContain("readyActivation.dispose()");
		expect(dockRegion).not.toContain("readyGenerationRef");
		expect(dockRegion).not.toContain("readySessionRef");
		expect(dockRegion).not.toContain("apiRef.current");
		expect(dockRegion).not.toContain("currentScopeRef");
		expect(dockRegion).not.toContain("replaceDockReadyAdapters");
		expect(dockRegion).not.toContain("createDockReadyCleanup");
		expect(dockRegion).not.toContain("readyCleanup.add(");
		expect(dockRegion).not.toContain("cleanupRef");
		expect(dockRegion).not.toContain(".splice(0).reverse()");
	});

	test("DockRegion delegates panel command lifecycle while retaining product bus policy", () => {
		const region = readSource("./DockRegion.tsx");

		expect(region).toContain("createDockPanelCommands");
		expect(region).toContain("installDockPanelCommandSubscriptions");
		expect(region).toContain("host.bus.on('panel:open'");
		expect(region).toContain("host.bus.on('panel:close'");
		expect(region).toContain("host.bus.on('panel:focus'");
		expect(region).toContain("host.bus.on('panel:reveal'");
		expect(region).toContain("isMemberRef.current(id)");
		expect(region).not.toContain("useEffect(() => host.bus.on('panel:open'");
		expect(region).not.toContain("useEffect(() => host.bus.on('panel:close'");
		expect(region).not.toContain("useEffect(() => host.bus.on('panel:focus'");
		expect(region).not.toContain("useEffect(() => host.bus.on('panel:reveal'");
		expect(region).not.toContain("designedDockPanelPosition(");
	});

	test("DockRegion delegates layout persistence lifecycle while retaining product keys and Dockview policy", () => {
		const dockRegion = readSource("./DockRegion.tsx");

		expect(dockRegion).toContain("createDockLayoutPersistence");
		expect(dockRegion).toContain("installDockLayoutObservation");
		expect(dockRegion).toContain("installDockLayoutReset");
		expect(dockRegion).toContain("layoutPersistence.captureAndSave");
		expect(dockRegion).toContain("pruneSerializedDockLayout");
		expect(dockRegion).toContain("api.toJSON()");
		expect(dockRegion).toContain("pageLayoutStore.load(key, identity)");
		expect(dockRegion).toContain("pageLayoutStore.save(key, identity, layout)");
		expect(dockRegion).toContain("pageLayoutStore.remove(key)");
		expect(dockRegion).toContain("forgeax:project:");
		expect(dockRegion).toContain("pruneSerializedDockLayout");
		expect(dockRegion).not.toContain("api.onDidLayoutChange(");
		expect(dockRegion).not.toContain(
			"useEffect(() => host.bus.on('dock:reset'",
		);
		expect(dockRegion).not.toContain("if (scope) layoutPersistence.clear");
		expect(dockRegion).not.toContain("suppressLayoutSaveRef");
	});

	test("window lifecycle carriers are public while Interface keeps runtime, URL and native adapter policy", () => {
		const surface = readSource("../../lib/platform/surface.ts");
		const windowManager = readSource("../../lib/platform/window-manager.ts");
		const pageTypes = readSource("../../core/page-platform/types.ts");

		expect(surface).toContain("from '@forgeax/app-shell/window'");
		expect(surface).not.toContain("function surfaceKey");
		expect(surface).not.toContain("function surfaceWindowLabel");
		expect(surface).not.toContain("function encodeSurfaceQuery");
		expect(surface).not.toContain("function decodeSurfaceFromLocation");
		expect(surface).toContain("export function encodeSurfaceWindowQuery");
		expect(surface).toContain("export function surfaceWindowUrl");
		expect(windowManager).toContain("from '@forgeax/app-shell/window'");
		expect(windowManager).toContain("createBrowserWindowManager({");
		expect(windowManager).toContain("createExternalWindowManager({");
		expect(windowManager).toContain("loadHost: loadTauriWindowHost");
		expect(windowManager).toContain(
			"encodeSurfaceWindowQuery(d, 'browser-page')",
		);
		expect(windowManager).toContain(
			"surfaceWindowUrl(surface, 'tauri-webview')",
		);
		expect(windowManager).not.toContain("window.open(");
		expect(windowManager).not.toContain("new Map<string, Window>");
		expect(windowManager).not.toContain("setInterval(");
		expect(windowManager).not.toContain("const closeListeners");
		expect(windowManager).not.toContain("function notifyClosed");
		expect(windowManager).not.toContain("function createTauriWindowManager");
		expect(windowManager).not.toContain("export interface WindowManager");
		expect(windowManager).not.toContain("export interface DetachWindowOptions");
		expect(pageTypes).toContain("from '@forgeax/app-shell/pages'");
		expect(pageTypes).toContain("PanelTypeRegistration");
	});

	test("dock-panel window transactions use the public instance-scoped controller", () => {
		const panelWindowing = readSource("./panelWindowing.ts");

		expect(panelWindowing).toContain("createPanelWindowingController");
		expect(panelWindowing).toContain("panelWindowing.openPanelWindow");
		expect(panelWindowing).toContain("panelWindowing.panelForClosedSurface");
		expect(panelWindowing).not.toContain("new Map");
		expect(panelWindowing).not.toContain("queueMicrotask");
		expect(panelWindowing).not.toContain("surfaceKey(");
	});

	test("surface floating state and redock orchestration belong to App Shell", () => {
		const shellState = readSource("../../store-parts/shell.ts");
		const store = readSource("../../store.ts");
		const platform = readSource("../../lib/platform/surface-windowing.ts");

		expect(platform).toContain("createSurfaceWindowingController({");
		expect(platform).toContain("beforeDetach:");
		expect(shellState).toContain(
			"getSurfaceWindowingController().detachSurface",
		);
		expect(shellState).toContain(
			"getSurfaceWindowingController().redockSurface",
		);
		expect(shellState).not.toContain("floatingSurfaces: {}");
		expect(shellState).not.toContain("markSurfaceDocked:");
		expect(store).not.toContain("floatingSurfaces: Record<string, true>");
		expect(store).not.toContain("markSurfaceDocked:");
	});

	test("edge pin state belongs to App Shell while Interface keeps Dockview wiring", () => {
		const pinAdapter = readSource("./edgePinStore.ts");
		const dockTab = readSource("./DockTab.tsx");

		expect(pinAdapter).toContain("createEdgePinStore()");
		expect(pinAdapter).not.toContain("new Map<");
		expect(pinAdapter).not.toContain("new Set<");
		expect(pinAdapter).toContain("EDGE_PIN_CLASS = 'fx-edge-pin'");
		expect(dockTab).toContain("useTabPinnedState");
		expect(dockTab).not.toContain("useSyncExternalStore");
	});

	test("Dock tab frame presentation delegates to App Shell while product policy stays local", () => {
		const dockTab = readSource("./DockTab.tsx");

		expect(dockTab).toContain("DockTabFrame");
		expect(dockTab).toContain("DockTabAction");
		expect(dockTab).toContain("DockTabIcon");
		expect(dockTab).toContain("DockTabTitle");
		expect(dockTab).toContain("from '@forgeax/app-shell/react'");
		expect(dockTab).not.toContain('className="dv-default-tab"');
		expect(dockTab).not.toContain('className="dv-default-tab-content"');
		expect(dockTab).not.toContain('className="dv-default-tab-action"');
		expect(dockTab).not.toContain('className="fx-dock-tab-icon"');
		expect(dockTab).not.toContain('className="fx-dock-tab-title"');
		expect(dockTab).toContain("iconForDockPanel");
		expect(dockTab).toContain("useInfoIssueCounts");
		expect(dockTab).toContain("useTabCloseInteractions");
		expect(dockTab).toContain("EDGE_PIN_CLASS");
	});

	test("Dock tab status summary presentation delegates to App Shell while health policy stays local", () => {
		const dockTab = readSource("./DockTab.tsx");
		const appCss = readSource("../../App.css");
		const statusCss = readSource("../StatusBar/GlobalStatusBar.css");

		expect(dockTab).toContain("DockTabStatusSummary");
		expect(dockTab).toContain("from '@forgeax/app-shell/react'");
		expect(dockTab).not.toContain('className="fx-info-tab-counts"');
		expect(dockTab).not.toContain('className="fx-info-tab-count ');
		expect(dockTab).not.toContain('className="fx-info-tab-count-icon"');
		expect(dockTab).not.toContain('className="fx-info-tab-count-value"');
		expect(dockTab).toContain("useInfoIssueCounts");
		expect(dockTab).toContain("barePanelId(panelId) !== 'info'");
		expect(dockTab).toContain(
			"aria-label={`${infoIssueCounts.error} errors, ${infoIssueCounts.warn} warnings`}",
		);
		expect(appCss).toContain("@import '@forgeax/app-shell/dock-tab.css';");
		expect(statusCss).not.toMatch(/(^|\n)\.fx-dock-tab-status-summary\s*\{/);
		expect(statusCss).not.toMatch(/(^|\n)\.fx-dock-tab-status-item\s*\{/);
		expect(statusCss).not.toMatch(/(^|\n)\.fx-dock-tab-status-icon\s*\{/);
		expect(statusCss).not.toMatch(/(^|\n)\.fx-dock-tab-status-value\s*\{/);
		expect(statusCss).toMatch(
			/\.fx-dock-tab-status-item--error\s*\{\s*color:\s*#ff6b6b;\s*}/,
		);
		expect(statusCss).toMatch(
			/\.fx-dock-tab-status-item--warning\s*\{\s*color:\s*#e6c14b;\s*}/,
		);
	});

	test("detached surface framing delegates to App Shell while product routing stays local", () => {
		const surface = readSource("../DetachedSurface.tsx");
		const appCss = readSource("../../App.css");
		const globalCss = readSource("../../styles/global.css");

		expect(surface).toContain("DetachedSurfaceStatus");
		expect(surface).toContain("<DetachedSurfaceFrame panel>");
		expect(surface).toContain("<DetachedSurfaceFrame centered>");
		expect(surface).toContain('<DetachedSurfaceStatus tone="error">');
		expect(surface).not.toContain("style={{ color: '#888' }}");
		expect(surface).not.toContain("style={{ color: '#c44' }}");
		expect(surface).toContain("switch (surface.id)");
		expect(surface).toContain("useExtensionManifest(surface.id)");
		expect(surface).not.toContain("const fill:");
		expect(surface).not.toContain("const fillCenter:");
		expect(appCss).toContain("@import '@forgeax/app-shell/detached.css';");
		expect(globalCss).not.toContain(".fx-detached-surface");
		expect(globalCss).not.toContain(".fx-detached-panel");
	});

	test("generic surface placeholder markup belongs to App Shell", () => {
		const owners = [
			readSource("../DetachedSurface.tsx"),
			readSource("../Surfaces/SurfaceKeepAliveLayer.tsx"),
		];

		for (const owner of owners) {
			expect(owner).toContain("SurfacePlaceholder");
			expect(owner).not.toContain('<div className="surface-placeholder">');
			expect(owner).not.toContain(
				'<div className="surface-placeholder-title">',
			);
		}
	});

	test("generic surface region markup and fill presentation belong to App Shell", () => {
		const appCss = readSource("../../App.css");
		const mainAreaCss = readSource("../MainArea/MainArea.css");
		const owners = [
			readSource("../MainArea/SurfacePanels.tsx"),
			readSource("../DetachedSurface.tsx"),
			readSource("../Surfaces/SurfaceKeepAliveLayer.tsx"),
		];

		expect(appCss).toContain("@import '@forgeax/app-shell/surface.css';");
		expect(mainAreaCss).not.toMatch(/(^|\n)\.surface-region\s*\{/);
		expect(mainAreaCss).not.toContain(
			".surface-region > :not(.preview-fatal-banner)",
		);
		for (const owner of owners) {
			expect(owner).toContain("SurfaceRegion");
			expect(owner).not.toContain('className="surface-region"');
			expect(owner).not.toContain('surface-region"');
		}
	});

	test("keep-alive floating state comes from the public windowing controller", () => {
		const keepAlive = readSource("../Surfaces/SurfaceKeepAliveLayer.tsx");

		expect(keepAlive).toContain("useFloatingSurfaces");
		expect(keepAlive).not.toContain("useShellStore");
		expect(keepAlive).not.toContain("state.floatingSurfaces");
	});

	test("generic unavailable-panel markup and presentation belong to App Shell", () => {
		const panelShell = readSource("../PanelShell/PanelShell.tsx");
		const panelCss = readSource("../PanelShell/PanelShell.css");

		expect(panelShell).toContain("PanelEmptyState");
		expect(panelShell).toContain("data-panel={id}");
		expect(panelShell).toContain('data-panel-unmounted="1"');
		expect(panelShell).not.toContain('<div className="fx-panel-empty"');
		expect(panelShell).not.toContain('<div className="fx-panel-empty-title"');
		expect(panelShell).not.toContain('<div className="fx-panel-empty-detail"');
		expect(panelCss).not.toMatch(/(^|\n)\.fx-panel-empty\s*\{/);
		expect(panelCss).not.toMatch(/(^|\n)\.fx-panel-empty-title\s*\{/);
		expect(panelCss).not.toMatch(/(^|\n)\.fx-panel-empty-detail\s*\{/);
	});

	test("product resizer skins neutralize the generic gutter margin", () => {
		const appCss = readSource("../../App.css");
		const dockCss = readSource("./DockShell.css");

		expect(
			appCss.match(/\.fx-chat-resizer\s*\{[^}]*margin:\s*0;/s),
		).not.toBeNull();
		expect(
			dockCss.match(/\.fx-auxbar-resizer\s*\{[^}]*margin:\s*0;/s),
		).not.toBeNull();
		expect(
			appCss.match(
				/\.resize-handle\.fx-chat-resizer::after\s*\{[^}]*content:\s*none;/s,
			),
		).not.toBeNull();
		expect(
			dockCss.match(
				/\.resize-handle\.fx-auxbar-resizer::after\s*\{[^}]*content:\s*none;/s,
			),
		).not.toBeNull();
	});
});
