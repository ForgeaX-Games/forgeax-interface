import { isSlotDebugEnabled, SlotDebugOverlay } from "@forgeax/app-shell/react";
import {
	type ComponentType,
	useEffect,
	useMemo,
	useSyncExternalStore,
} from "react";
import { useTranslation } from "@/i18n";
import type { InterfaceApplicationRuntime } from "./application";
import { ActivityRail } from "./components/ActivityRail/ActivityRail";
import { CommandPalette } from "./components/CommandPalette/CommandPalette";
import { ContextMenu } from "./components/ContextMenu/ContextMenu";
import { DockRegion } from "./components/DockShell/DockRegion";
import {
	DEFAULT_PANEL_RENDERERS,
	PanelRenderersProvider,
} from "./components/DockShell/panelRenderers";
import { DrawerHostView } from "./components/Drawer/DrawerHostView";
import { PassiveFeedbackHost } from "./components/Feedback/PassiveFeedback";
import {
	ConnectModelPrompt,
	OnboardingController,
} from "./components/Onboarding";
import { useOnboardingPhase } from "./components/Onboarding/types";
import { PageTabStrip } from "./components/PageTabs/PageTabStrip";
import { StripHostView } from "./components/StatusBar/StripHostView";
import { SurfaceKeepAliveLayer } from "./components/Surfaces/SurfaceKeepAliveLayer";
import { ActiveGameWindowTitle } from "./components/TopBar/GameIdentityButton";
import { GameModalHost } from "./components/TopBar/GameSwitcher";
import { GameDirectoryModalHost } from "./components/TopBar/ProjectSwitcher";
import { TopBar } from "./components/TopBar/TopBar";
import { DialogHost } from "./lib/dialog";
import { useGlobalShortcuts } from "./lib/global-shortcuts";
import { initNativeMenuBridge } from "./lib/native-menu-bridge";
import { useShellStore } from "./store";
import "./App.css";

export type { ApplicationDetachedShellProps } from "./ApplicationDetachedShell";
export { ApplicationDetachedShell } from "./ApplicationDetachedShell";

export interface ApplicationOnboardingOptions {
	/** Whether this product assembly participates in Interface onboarding. */
	readonly enabled?: boolean;
	readonly tourEnabled?: boolean;
}

export interface ApplicationShellProps {
	readonly runtime: InterfaceApplicationRuntime;
	readonly onboarding?: ApplicationOnboardingOptions;
	/** Product owns keyboard installation; compatibility callers keep the default. */
	readonly KeyboardRouter?: ComponentType<{
		runtime: InterfaceApplicationRuntime;
	}>;
	/** Product selects native transport and labels; standalone keeps compatibility. */
	readonly NativeMenuBridge?: ComponentType<{
		runtime: InterfaceApplicationRuntime;
	}>;
}

function CompatibilityKeyboardRouter({
	runtime,
}: {
	runtime: InterfaceApplicationRuntime;
}): null {
	useGlobalShortcuts(
		runtime.host.keybindings,
		runtime.host.shortcuts,
		runtime.shellShortcuts,
	);
	return null;
}

function CompatibilityNativeMenuBridge({
	runtime,
}: {
	runtime: InterfaceApplicationRuntime;
}): null {
	const { t } = useTranslation();
	useEffect(
		() =>
			initNativeMenuBridge({
				menus: runtime.host.menus,
				execute: (id, args) => runtime.host.commands.execute(id, args),
				translate: t,
			}),
		[runtime, t],
	);
	return null;
}

export function isApplicationOnboardingEnabled(
	onboarding?: ApplicationOnboardingOptions,
): boolean {
	return onboarding?.enabled !== false;
}

/**
 * Renders the shared Interface chrome for a runtime owned by the product root.
 * Product startup and disposal deliberately stay outside this component.
 */
export function ApplicationShell({
	runtime,
	onboarding,
	KeyboardRouter = CompatibilityKeyboardRouter,
	NativeMenuBridge = CompatibilityNativeMenuBridge,
}: ApplicationShellProps): React.ReactElement {
	const fullscreen = useShellStore((state) => state.fullscreen);
	const sidebarCollapsed = useShellStore((state) => state.sidebarCollapsed);
	const chatpanelCollapsed = useShellStore((state) => state.chatpanelCollapsed);
	const onboardingPhase = useOnboardingPhase();
	const onboardingEnabled = isApplicationOnboardingEnabled(onboarding);
	const shellHidden =
		onboardingEnabled &&
		(onboardingPhase === "welcome" || onboardingPhase === "project");

	const subscribePanels = useMemo(
		() => (callback: () => void) => runtime.control.onPanelsChange(callback),
		[runtime],
	);
	const renderers = useSyncExternalStore(
		subscribePanels,
		() => runtime.host.panels,
		() => DEFAULT_PANEL_RENDERERS,
	);

	const Dashboard = renderers.overlays?.Dashboard;
	const Settings = renderers.overlays?.Settings;
	const StatusBar = renderers.slots?.StatusBar ?? StripHostView;

	if (shellHidden) {
		return (
			<>
				<KeyboardRouter runtime={runtime} />
				<NativeMenuBridge runtime={runtime} />
				<PanelRenderersProvider value={renderers}>
					<div className="studio-shell studio-shell--preview-skin">
						<OnboardingController tourEnabled={onboarding?.tourEnabled} />
						<DialogHost />
					</div>
				</PanelRenderersProvider>
			</>
		);
	}

	return (
		<>
			<KeyboardRouter runtime={runtime} />
			<NativeMenuBridge runtime={runtime} />
			<PanelRenderersProvider value={renderers}>
				<div
					className="studio-shell studio-shell--preview-skin"
					data-fullscreen={fullscreen ? "1" : undefined}
					data-sidebar-collapsed={sidebarCollapsed ? "1" : undefined}
					data-chatpanel-collapsed={chatpanelCollapsed ? "1" : undefined}
				>
					{onboardingEnabled && (
						<OnboardingController tourEnabled={onboarding?.tourEnabled} />
					)}
					<ConnectModelPrompt />
					<ActiveGameWindowTitle />
					<TopBar />
					<PassiveFeedbackHost />
					<div className="studio-body">
						<div className="studio-main-col">
							<PageTabStrip />
							<div className="studio-main-dock">
								<DockRegion region="DockShell" />
								<DockRegion region="AuxBar" />
							</div>
						</div>
						<SurfaceKeepAliveLayer />
						<ActivityRail />
						<DockRegion region="ChatDock" />
					</div>
					<DrawerHostView />
					<StatusBar />
					{Dashboard && (
						<div data-fx-slot="Dashboard" style={{ display: "contents" }}>
							<Dashboard />
						</div>
					)}
					{Settings && (
						<div data-fx-slot="Settings" style={{ display: "contents" }}>
							<Settings />
						</div>
					)}
					<ContextMenu />
					<CommandPalette />
					<GameDirectoryModalHost />
					<GameModalHost />
					<DialogHost />
					{isSlotDebugEnabled() && <SlotDebugOverlay />}
				</div>
			</PanelRenderersProvider>
		</>
	);
}
