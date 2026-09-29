// Custom dockview tab — the default tab with a leading Lucide panel icon.
//
// Wired as `<DockviewReact defaultTabComponent={DockTab} />`, so every dock tab
// (static, ep:*, page-mode) gets an icon without touching per-panel registration.
//
// This is a faithful re-implementation of dockview's `DockviewDefaultTab`
// (node_modules/dockview .../dockview/defaultTab.js): it forwards the pointer
// handlers dockview injects for drag/activate and preserves the exact
// `.dv-default-tab` / `.dv-default-tab-content` / `.dv-default-tab-action` DOM
// hooks the stylesheets and `edgeDrawer.ts`'s click routing key off. The
// additions are a leading `.fx-dock-tab-icon` (inside `.dv-default-tab`, so the
// whole tab stays draggable/clickable), a Lucide `X` close glyph (design-system
// on-brand, avoids a deep `dockview/.../svg` import), and a Lucide `Pin` that
// takes the X's place on edge-strip tabs (see `useEdgePin` below).
//
// CLOSE BUTTON: React synthetic events and native mousedown/click are
// unreliable here because calling preventDefault() on pointerdown (needed to
// prevent tab activation) suppresses subsequent mousedown/click per the W3C
// Pointer Events spec. The public App Shell interaction hook owns that native
// pointerdown and the matching middle-button session; this file only injects
// Dockview close policy and forwards Dockview's tab handlers.

import {
	DockTabAction,
	DockTabFrame,
	DockTabIcon,
	DockTabStatusSummary,
	DockTabTitle,
	type LiveTabPlacementSource,
	type LiveTabTitleSource,
	useLiveTabPlacement,
	useLiveTabTitle,
	useTabCloseInteractions,
	useTabPinnedState,
} from "@forgeax/app-shell/react";
import type { IDockviewDefaultTabProps } from "dockview";
import { Pin, X } from "lucide-react";
import {
	type PointerEvent,
	type ReactElement,
	useCallback,
	useMemo,
} from "react";
import { useTranslation } from "@/i18n";
import { barePanelId, iconForDockPanel } from "../../lib/panel-tab-icons";
import { useHealthStore } from "../StatusBar/healthStore";
import { EDGE_PIN_CLASS, edgePinStateSource } from "./edgePinStore";

const EMPTY_HEALTH_ENTRIES = Object.freeze([]);

/** Track the live tab title (dockview mutates it via `api.setTitle`). */
function useTitle(api: IDockviewDefaultTabProps["api"]): string | undefined {
	const source = useMemo<LiveTabTitleSource>(
		() => ({
			getTitle: () => api.title,
			subscribe: (listener) => {
				const disposable = api.onDidTitleChange(listener);
				return () => disposable.dispose();
			},
		}),
		[api],
	);
	return useLiveTabTitle(source);
}

/**
 * The displayed tab name is DERIVED at render — never read from the persisted
 * layout. Same shape as the icon (`iconForDockPanel(api.id)`): the panel id is
 * the key, i18n is the lookup. `dockShell.panelTitles.<bareId>` wins and is
 * locale-reactive (useTranslation re-renders on language change), so a stored
 * `api.title` baked into the dockview layout JSON is ignored for keyed panels.
 * Panels without a catalog key (host-injected editor/extension panels) fall
 * back to the live `api.title` the host set at mount — their own name, as-is.
 */
function useDockTabName(
	api: IDockviewDefaultTabProps["api"],
): string | undefined {
	const stored = useTitle(api);
	const { t } = useTranslation();
	const key = `dockShell.panelTitles.${barePanelId(api.id)}`;
	const localized = t(key);
	return localized !== key ? localized : stored;
}

function useInfoIssueCounts(
	panelId: string,
): { error: number; warn: number } | null {
	const entries = useHealthStore((s) =>
		barePanelId(panelId) === "info" ? s.entries : EMPTY_HEALTH_ENTRIES,
	);
	return useMemo(() => {
		if (barePanelId(panelId) !== "info") return null;
		let error = 0;
		let warn = 0;
		for (const entry of entries) {
			if (entry.level === "error") error++;
			else if (entry.level === "warn") warn++;
		}
		return { error, warn };
	}, [entries, panelId]);
}

/**
 * Edge-strip tabs show a per-tab Pin toggle where a grid tab shows close (X) —
 * see edgeDrawer.ts for the rules. Both bits are DERIVED from live dockview
 * state, so the first paint after a refresh is already correct:
 * `onDidLocationChange` fires on any group change (dockviewPanelApi sets it from
 * the `group` setter), which covers dragging a panel into or out of a strip.
 */
function useEdgePin(api: IDockviewDefaultTabProps["api"]): {
	isEdge: boolean;
	pinned: boolean;
} {
	const source = useMemo<LiveTabPlacementSource>(
		() => ({
			getPlacement: () => ({
				isEdge: api.location.type === "edge",
				groupId: api.group.id,
			}),
			subscribe: (listener) => {
				const disposable = api.onDidLocationChange(listener);
				return () => disposable.dispose();
			},
		}),
		[api],
	);
	const home = useLiveTabPlacement(source) ?? {
		isEdge: false,
		groupId: api.group.id,
	};
	const pinned = useTabPinnedState(edgePinStateSource, home.groupId, api.id);
	return { isEdge: home.isEdge, pinned };
}

export function DockTab({
	api,
	containerApi: _containerApi,
	params: _params,
	hideClose,
	closeActionOverride,
	onPointerDown,
	onPointerUp,
	onPointerLeave,
	tabLocation: _tabLocation,
	...rest
}: IDockviewDefaultTabProps): ReactElement {
	const title = useDockTabName(api);
	const infoIssueCounts = useInfoIssueCounts(api.id);
	const Icon = iconForDockPanel(api.id);
	const { isEdge, pinned } = useEdgePin(api);
	const close = useCallback(() => {
		if (closeActionOverride) closeActionOverride();
		else api.close();
	}, [api, closeActionOverride]);
	const closeInteractions = useTabCloseInteractions<HTMLDivElement>({
		close,
		disabled: hideClose,
		onPointerDown,
		onPointerUp,
		onPointerLeave,
	});

	const onBtnPointerDown = useCallback(
		(event: PointerEvent) => event.preventDefault(),
		[],
	);
	const infoStatusItems =
		infoIssueCounts === null
			? []
			: [
					...(infoIssueCounts.error > 0
						? [
								{
									id: "errors",
									tone: "error" as const,
									icon: "✖",
									value: infoIssueCounts.error,
								},
							]
						: []),
					...(infoIssueCounts.warn > 0
						? [
								{
									id: "warnings",
									tone: "warning" as const,
									icon: "⚠",
									value: infoIssueCounts.warn,
								},
							]
						: []),
				];
	const action = hideClose ? undefined : isEdge ? (
		// The toggle itself is driven by edgeDrawer's capture-phase click
		// handler (it must preventDefault dockview's native expand before the
		// event ever reaches React), so this renders state and carries the
		// panel id that handler reads back — no onClick of its own.
		<DockTabAction
			className={`${EDGE_PIN_CLASS}${pinned ? ` ${EDGE_PIN_CLASS}--on` : ""}`}
			data-fx-edge-pin-panel={api.id}
			role="button"
			aria-pressed={pinned}
			aria-label={pinned ? "Unpin tab" : "Pin tab"}
			title={pinned ? "Unpin" : "Pin"}
			onPointerDown={onBtnPointerDown}
		>
			<Pin className="fx-edge-pin-icon" size={12} aria-hidden />
		</DockTabAction>
	) : (
		<DockTabAction ref={closeInteractions.closeRef}>
			<X size={14} aria-hidden />
		</DockTabAction>
	);

	return (
		<DockTabFrame
			data-testid="dockview-dv-default-tab"
			{...rest}
			onPointerDown={closeInteractions.onPointerDown}
			onPointerUp={closeInteractions.onPointerUp}
			onPointerLeave={closeInteractions.onPointerLeave}
			leading={
				<DockTabIcon>
					<Icon size={14} aria-hidden />
				</DockTabIcon>
			}
			action={action}
		>
			<DockTabTitle>{title}</DockTabTitle>
			{infoIssueCounts !== null && infoStatusItems.length > 0 && (
				<DockTabStatusSummary
					aria-label={`${infoIssueCounts.error} errors, ${infoIssueCounts.warn} warnings`}
					items={infoStatusItems}
				/>
			)}
		</DockTabFrame>
	);
}
