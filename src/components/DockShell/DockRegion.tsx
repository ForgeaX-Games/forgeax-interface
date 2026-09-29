import {
	type DockviewApi,
	DockviewReact,
	type DockviewReadyEvent,
	type DockviewTheme,
	type SerializedDockview,
	themeAbyss,
} from "dockview";
import { RotateCcw } from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import "dockview/dist/styles/dockview.css";
import {
	createDockLayoutControlState,
	createDockLayoutPersistence,
	createDockPanelCommands,
	createDockReadyActivation,
	createDockScopeTransition,
	type DockLayoutControlState,
	hasMountedPanelPlacement,
	installDockLayoutObservation,
	installDockLayoutReset,
	installDockPanelCommandSubscriptions,
	installDockPanelVisibilityTracking,
	pruneSerializedDockLayout,
} from "@forgeax/app-shell/dock";
import { AnchoredResizeHandle, DockLayoutMenu } from "@forgeax/app-shell/react";
import { t as panelT, useTranslation } from "@/i18n";
import { useHost } from "../../core/app-shell";
import {
	type PageLayoutIdentity,
	pageLayoutStore,
	pageLayoutToDockview,
} from "../../core/page-platform";
import { iconForDockPanel } from "../../lib/panel-tab-icons";
import { getCurrentProject } from "../../lib/project-context";
import { pingAnchorRelayout } from "../../lib/surfaceAnchors";
import { SessionTabStrip } from "../ChatColumn/SessionTabStrip";
import { chatWidthStore, useChatWidth } from "../ChatColumn/useChatWidth";
import { DockTab } from "./DockTab";
import { withDockTitleRestore } from "./dockTitle";
import { registerDockRegion, registerDockviewApi } from "./dockviewRegistry";
import { installEdgeDrawer } from "./edgeDrawer";
import {
	isFooterPanelId,
	isFooterPanelUserVisible,
	requestFooterPanelEnsure,
	setFooterPanelUserVisible,
	subscribeFooterPanelVisibility,
} from "./footer-panel-visibility";
import { FOOTER_PANEL_IDS } from "./footer-panels";
import {
	BASE_PANEL_COMPONENTS,
	BASE_PANEL_TITLE,
	BASE_PANEL_WINDOWING,
	buildEditorPanelComponents,
	CORE_PANEL_IDS,
	OPTIONAL_PANEL_IDS,
} from "./panelRegistry";
import { usePanelRenderers } from "./panelRenderers";
import { createPanelTabCommands } from "./panelTabCommands";
import type { PanelWindowingSources } from "./panelWindowing";
import { pageRuntimeOwnsPanel } from "./panelWindowing";
import type { DockRegion as DockRegionId } from "./regions";
import { resolveRegion } from "./resolveRegion";
import { createStudioTabContextMenuHandler } from "./studioTabMenuProvider";
import { installUeDockDrag } from "./ueDrag/controller";
import { auxBarWidthStore, useAuxBarWidth } from "./useAuxBarWidth";
import "./DockShell.css";
import { isDockTitleHidden, setDockTitleHidden } from "./dockTitle";
import { isOnSideEdge } from "./sideEdgeMove";

const FORGEAX_DOCK_THEME: DockviewTheme = {
	...themeAbyss,
	name: "forgeax-abyss",
	gap: 6,
};

interface ActivePageScope {
	readonly layoutId: string;
	readonly identity: PageLayoutIdentity;
	readonly layout: SerializedDockview;
	readonly panelIds: readonly string[];
}

interface DockLayoutControlAnchor {
	readonly top: number;
	readonly bottom: number;
	readonly left: number;
	readonly right: number;
}

export function DockRegion({ region }: { region: DockRegionId }) {
	const host = useHost();
	const renderers = usePanelRenderers();
	const editorPanelIds = renderers.editorPanelIds;
	const auxBarWidth = useAuxBarWidth();
	const chatWidth = useChatWidth();
	const pageSession = useSyncExternalStore(
		host.pages.subscribe,
		host.pages.getSnapshot,
		host.pages.getSnapshot,
	);
	const activePage = pageSession.instances.find(
		(page) => page.encodedKey === pageSession.activeKey,
	);
	const resolvedPage = activePage
		? host.pageRegistry.get(activePage.typeId)
		: undefined;
	const pageScope = useMemo<ActivePageScope | null>(() => {
		if (
			region === "ChatDock" ||
			!activePage ||
			!resolvedPage ||
			resolvedPage.status !== "available"
		)
			return null;
		const layout =
			"grid" in resolvedPage.layout
				? resolvedPage.layout
				: pageLayoutToDockview(
						activePage.typeId,
						resolvedPage.definition.title,
						resolvedPage.panels,
						resolvedPage.layout,
					);
		return {
			layoutId: activePage.typeId,
			identity: {
				pageTypeId: activePage.typeId,
				layoutVersion: resolvedPage.definition.layoutVersion ?? 1,
			},
			layout,
			panelIds: resolvedPage.panels.map((panel) => panel.id),
		};
	}, [activePage, region, resolvedPage]);
	const pagePanelIds = useMemo(
		() => new Set(pageScope?.panelIds ?? []),
		[pageScope],
	);
	const panels = renderers.panels;
	const isMember = useCallback(
		(id: string): boolean => {
			if (id === "chat") return region === "ChatDock";
			if (region === "ChatDock") return false;
			if (id.startsWith("ep:") && !editorPanelIds.includes(id.slice(3)))
				return false;
			if (pageScope && !pagePanelIds.has(id)) return false;
			const descriptor = panels?.[id];
			if (descriptor && !(descriptor.when?.() ?? true)) return false;
			return resolveRegion(id, descriptor ?? {}, {}) === region;
		},
		[editorPanelIds, pagePanelIds, pageScope, panels, region],
	);
	const isMemberRef = useRef(isMember);
	useLayoutEffect(() => {
		isMemberRef.current = isMember;
	}, [isMember]);

	const components = useMemo(
		() => ({
			...(resolvedPage?.status === "available" && activePage
				? Object.fromEntries(
						resolvedPage.panels
							.filter((placement) =>
								pageRuntimeOwnsPanel(
									placement.id,
									new Set(Object.keys(BASE_PANEL_COMPONENTS)),
									editorPanelIds,
								),
							)
							.map((placement) => [
								placement.id,
								withDockTitleRestore(() =>
									placement.panelType.runtime.kind === "iframe" ? (
										<iframe
											src={placement.panelType.runtime.src}
											title={placement.id}
											style={{ width: "100%", height: "100%", border: 0 }}
										/>
									) : (
										placement.panelType.runtime.render({
											pageKey: activePage.key,
											placementId: placement.id,
											pageContext: activePage.context,
											initialProps: placement.initialProps,
										})
									),
								),
							]),
					)
				: {}),
			...BASE_PANEL_COMPONENTS,
			...buildEditorPanelComponents(editorPanelIds),
		}),
		[activePage, editorPanelIds, resolvedPage],
	);
	const componentKeys = useMemo(
		() => new Set(Object.keys(components)),
		[components],
	);
	const componentKeysRef = useRef(componentKeys);
	useLayoutEffect(() => {
		componentKeysRef.current = componentKeys;
	}, [componentKeys]);
	/** Stable signature — HMR refreshes panel render fns without changing registered ids. */
	const componentKeysSignature = useMemo(
		() => [...componentKeys].sort().join("\0"),
		[componentKeys],
	);
	const pageScopeKey = useMemo(() => {
		if (!pageScope) return "";
		return `${pageScope.layoutId}:${pageScope.identity.layoutVersion}:${pageScope.panelIds.join(",")}`;
	}, [pageScope]);
	const readyActivation = useMemo(
		() => createDockReadyActivation<DockviewApi>(),
		[],
	);
	const layoutControl = useMemo(
		() => createDockLayoutControlState<DockLayoutControlAnchor>(),
		[],
	);
	const applyScopeRef = useRef<
		(api: DockviewApi, scope: ActivePageScope | null) => void
	>(() => {});
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const [chatMounted, setChatMounted] = useState(true);

	const storageKey = useCallback(
		(scope: ActivePageScope) =>
			`forgeax:project:${getCurrentProject()}:page-layout:${scope.layoutId}:${region}`,
		[region],
	);
	const persistedScope = useCallback(
		(scope: ActivePageScope) => ({
			key: storageKey(scope),
			identity: scope.identity,
		}),
		[storageKey],
	);
	const layoutPersistence = useMemo(
		() =>
			createDockLayoutPersistence<SerializedDockview, PageLayoutIdentity>({
				load: (key, identity) => pageLayoutStore.load(key, identity),
				save: (key, identity, layout) =>
					pageLayoutStore.save(key, identity, layout),
				remove: (key) => pageLayoutStore.remove(key),
			}),
		[],
	);

	const titleFor = useCallback(
		(id: string): string => {
			const panelId = id.startsWith("ep:") ? id.slice(3) : id;
			const key = `dockShell.panelTitles.${panelId}`;
			const localized = panelT(key);
			return localized !== key
				? localized
				: (panels?.[panelId]?.title ?? BASE_PANEL_TITLE[id] ?? id);
		},
		[panels],
	);

	const windowingSources = useMemo(
		(): PanelWindowingSources => ({
			basePanelIds: new Set(Object.keys(BASE_PANEL_COMPONENTS)),
			baseWindowing: BASE_PANEL_WINDOWING,
			pageWindowing: {},
		}),
		[],
	);

	const panelTabCommands = useMemo(
		() =>
			createPanelTabCommands({
				getApi: () => readyActivation.getCurrent(),
				titleFor,
			}),
		[readyActivation, titleFor],
	);

	const getTabContextMenuItems = useMemo(
		() =>
			createStudioTabContextMenuHandler({
				region,
				getWrapEl: () => wrapRef.current,
				getApi: () => readyActivation.getCurrent(),
				commands: panelTabCommands,
				windowingSources,
			}),
		[panelTabCommands, region, windowingSources, readyActivation],
	);

	const applyScope = useCallback(
		(api: DockviewApi, scope: ActivePageScope | null): void => {
			if (region === "ChatDock") {
				try {
					api.clear();
				} catch {
					/* noop */
				}
				if (componentKeysRef.current.has("chat")) {
					api.addPanel({
						id: "chat",
						component: "chat",
						title: titleFor("chat"),
					});
				}
				return;
			}
			if (!scope || region !== "DockShell") {
				try {
					api.clear();
				} catch {
					/* noop */
				}
				return;
			}
			layoutPersistence.restore(persistedScope(scope), (saved) => {
				const allowedPanelIds = new Set(scope.panelIds);
				const candidate = saved
					? pruneSerializedDockLayout(
							saved,
							componentKeysRef.current,
							allowedPanelIds,
						)
					: null;
				const defaultLayout = pruneSerializedDockLayout(
					scope.layout,
					componentKeysRef.current,
					allowedPanelIds,
				);
				if (!defaultLayout) return;
				try {
					api.clear();
				} catch {
					/* noop */
				}
				try {
					if (candidate) {
						api.fromJSON(candidate);
						if (
							hasMountedPanelPlacement(
								scope.panelIds,
								new Set(api.panels.map((panel) => panel.id)),
							)
						)
							return;
						try {
							api.clear();
						} catch {
							/* noop */
						}
					}
					api.fromJSON(defaultLayout);
				} catch {
					try {
						api.clear();
						api.fromJSON(defaultLayout);
					} catch {
						/* invalid contribution stays empty */
					}
				}
				pingAnchorRelayout();
			});
		},
		[layoutPersistence, persistedScope, region, titleFor],
	);
	useLayoutEffect(() => {
		applyScopeRef.current = applyScope;
	}, [applyScope]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: pageScope transitions through the lifecycle below so the current dock API saves its prior scope first.
	const scopeTransition = useMemo(
		() =>
			createDockScopeTransition<ActivePageScope, DockviewApi>(
				{
					getLive: () => readyActivation.getCurrent(),
					save: (api, scope) => {
						if (region === "DockShell")
							layoutPersistence.save(persistedScope(scope), api.toJSON());
					},
					apply: (api, scope) => applyScopeRef.current(api, scope),
				},
				pageScope,
			),
		[layoutPersistence, persistedScope, readyActivation, region],
	);

	const onReady = useCallback(
		(event: DockviewReadyEvent) => {
			const api = event.api;
			const wrap = wrapRef.current;
			const activated = readyActivation.replace(api, [
				() => registerDockviewApi(api),
				...(wrap
					? [
							() =>
								registerDockRegion({
									viewId: api.id,
									region,
									api,
									wrapEl: wrap,
								}),
						]
					: []),
				() =>
					installDockPanelVisibilityTracking(api, {
						onAdded: (id) => {
							if (region === "ChatDock" && id === "chat") setChatMounted(true);
						},
						onRemoved: (id) => {
							if (region === "ChatDock" && id === "chat") setChatMounted(false);
						},
					}),
				() =>
					installDockLayoutObservation<ActivePageScope>(api, {
						getCurrentScope: scopeTransition.getCurrent,
						...(region === "DockShell"
							? {
									captureAndSave: (scope: ActivePageScope) =>
										layoutPersistence.captureAndSave(
											persistedScope(scope),
											() => {
												const raw = api.toJSON();
												const pruned = pruneSerializedDockLayout(
													raw,
													componentKeysRef.current,
													new Set(scope.panelIds),
												);
												return pruned ?? raw;
											},
										),
								}
							: {}),
						onCommitted: () => {
							layoutControl.refresh();
							pingAnchorRelayout();
						},
					}),
				...(region === "DockShell" && wrap
					? [
							() => installEdgeDrawer(api, wrap),
							() =>
								installUeDockDrag(api, wrap, {
									region,
									moveTo: () => {
										/* DockRegion layout persistence is handled below. */
									},
									titleFor,
								}),
						]
					: []),
			]);
			if (activated) scopeTransition.applyCurrent();
		},
		[
			layoutControl,
			layoutPersistence,
			persistedScope,
			readyActivation,
			region,
			scopeTransition,
			titleFor,
		],
	);

	useEffect(
		() => () => {
			readyActivation.dispose();
		},
		[readyActivation],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: component and scope signatures intentionally trigger a reapply when mutable dock registrations change.
	useEffect(() => {
		scopeTransition.transition(pageScope);
	}, [componentKeysSignature, pageScope, pageScopeKey, scopeTransition]);

	const basePanelCommands = useMemo(
		() =>
			createDockPanelCommands({
				getPanel: (id) => readyActivation.getCurrent()?.getPanel(id)?.api,
				addPanel: (options) => {
					readyActivation.getCurrent()?.addPanel(options);
				},
				canOpen: (id) =>
					Boolean(
						readyActivation.getCurrent() &&
							isMemberRef.current(id) &&
							componentKeysRef.current.has(id),
					),
				titleFor,
				authoredLayout: () => scopeTransition.getCurrent()?.layout,
				fallbackPanelId: () =>
					readyActivation
						.getCurrent()
						?.panels.find((panel) => panel.api.location.type === "grid")?.id,
			}),
		[readyActivation, scopeTransition, titleFor],
	);
	const panelCommands = useMemo(
		() => ({
			open(id: string) {
				if (FOOTER_PANEL_IDS.has(id)) {
					setFooterPanelUserVisible(id, true);
					requestFooterPanelEnsure();
					return (
						basePanelCommands.focus(id) ||
						Boolean(readyActivation.getCurrent()?.getPanel(id))
					);
				}
				return basePanelCommands.open(id);
			},
			close(id: string) {
				if (FOOTER_PANEL_IDS.has(id)) setFooterPanelUserVisible(id, false);
				return basePanelCommands.close(id);
			},
			focus(id: string) {
				return basePanelCommands.focus(id);
			},
			reveal(id: string) {
				if (FOOTER_PANEL_IDS.has(id)) {
					setFooterPanelUserVisible(id, true);
					requestFooterPanelEnsure();
					if (!readyActivation.getCurrent()?.getPanel(id)) return true;
					return basePanelCommands.reveal(id);
				}
				return basePanelCommands.reveal(id);
			},
		}),
		[basePanelCommands, readyActivation],
	);
	const reopen = useCallback(
		(id: string) => {
			panelCommands.open(id);
		},
		[panelCommands],
	);

	useEffect(
		() =>
			installDockPanelCommandSubscriptions(
				{
					onOpen: (listener) => ({
						dispose: host.bus.on("panel:open", ({ id }) => listener(id)),
					}),
					onClose: (listener) => ({
						dispose: host.bus.on("panel:close", ({ id }) => listener(id)),
					}),
					onFocus: (listener) => ({
						dispose: host.bus.on("panel:focus", ({ id }) => listener(id)),
					}),
					onReveal: (listener) => ({
						dispose: host.bus.on("panel:reveal", ({ id }) => listener(id)),
					}),
				},
				panelCommands,
			),
		[host, panelCommands],
	);
	useEffect(
		() =>
			installDockLayoutReset<ActivePageScope, DockviewApi>(
				{
					onReset: (listener) => ({
						dispose: host.bus.on("dock:reset", listener),
					}),
				},
				{
					getCurrentScope: scopeTransition.getCurrent,
					clear: (scope) => layoutPersistence.clear(persistedScope(scope)),
					getLive: readyActivation.getCurrent,
					apply: (api, scope) => applyScope(api, scope),
				},
			),
		[
			applyScope,
			host,
			layoutPersistence,
			persistedScope,
			readyActivation,
			scopeTransition,
		],
	);

	const eligible = Object.keys(panels ?? {}).filter(isMember).length;
	if (region !== "DockShell" && region !== "ChatDock" && eligible === 0)
		return null;

	const dockview = (
		<DockviewReact
			className="fx-dockshell"
			theme={FORGEAX_DOCK_THEME}
			components={components}
			defaultTabComponent={DockTab}
			getTabContextMenuItems={getTabContextMenuItems}
			onReady={onReady}
			disableFloatingGroups={false}
			hideBorders
		/>
	);

	return (
		<div
			className={`fx-dockwrap fx-dockregion fx-dockregion-${region}`}
			ref={wrapRef}
			data-fx-slot={region}
			style={
				region === "AuxBar"
					? { width: auxBarWidth }
					: region === "ChatDock"
						? { width: chatWidth, ...(chatMounted ? {} : { display: "none" }) }
						: undefined
			}
		>
			{region === "AuxBar" && (
				<AnchoredResizeHandle
					orientation="col"
					className="fx-auxbar-resizer"
					ariaLabel="Resize auxiliary bar"
					readSize={auxBarWidthStore.getSnapshot}
					writeSize={auxBarWidthStore.setSize}
					resizingBodyClassName="fx-auxbar-resizing"
				/>
			)}
			{region === "ChatDock" && (
				<AnchoredResizeHandle
					orientation="col"
					className="fx-chat-resizer"
					ariaLabel="Resize chat panel"
					readSize={chatWidthStore.getSnapshot}
					writeSize={chatWidthStore.setSize}
					resizingBodyClassName="fx-chat-resizing"
				/>
			)}
			{region === "ChatDock" ? (
				<div className="fx-chatdock-inner" style={{ width: chatWidth }}>
					<SessionTabStrip />
					{dockview}
				</div>
			) : (
				dockview
			)}
			{region === "DockShell" && !pageScope && (
				<div className="fx-page-empty" role="status">
					<span>{panelT("dockShell.emptySurface")}</span>
				</div>
			)}
			{region === "DockShell" && (
				<LayoutControl
					getApi={readyActivation.getCurrent}
					layoutControl={layoutControl}
					panels={(pageScope?.panelIds ?? []).map((id) => ({
						id,
						title: titleFor(id),
					}))}
					onReopen={reopen}
				/>
			)}
		</div>
	);
}

export function LayoutControl({
	getApi,
	layoutControl,
	panels,
	onReopen,
}: {
	getApi: () => DockviewApi | null;
	layoutControl: DockLayoutControlState<DockLayoutControlAnchor>;
	panels: readonly { id: string; title: string }[];
	onReopen: (id: string) => void;
}) {
	const host = useHost();
	const { t } = useTranslation();
	const onToggle = useCallback(
		(listener: (anchor?: DockLayoutControlAnchor) => void) => ({
			dispose: host.bus.on("dock:layout-toggle", (payload) =>
				listener(payload.rect),
			),
		}),
		[host],
	);
	useEffect(
		() => subscribeFooterPanelVisibility(() => layoutControl.refresh()),
		[layoutControl],
	);
	const isPanelOpen = useCallback(
		(panelId: string) =>
			isFooterPanelId(panelId)
				? isFooterPanelUserVisible(panelId)
				: Boolean(getApi()?.getPanel(panelId)),
		[getApi],
	);
	const closePanel = useCallback(
		(panelId: string) => {
			if (isFooterPanelId(panelId)) setFooterPanelUserVisible(panelId, false);
			getApi()?.getPanel(panelId)?.api.close();
		},
		[getApi],
	);
	return (
		<DockLayoutMenu
			state={layoutControl}
			onToggle={onToggle}
			isPanelOpen={isPanelOpen}
			closePanel={closePanel}
			reopenPanel={onReopen}
			onReset={() => {
				void host.commands.execute("app.dock.reset");
			}}
			resetLabel={t("dockShell.resetLayout")}
			sectionLabel={t("dockShell.mainPanels")}
			emptyLabel={t("dockShell.emptySurface")}
			resetIcon={<RotateCcw size={12} />}
			renderPanelActions={(panel) => {
				const dockPanel = getApi()?.getPanel(panel.id);
				const titleGroup =
					panel.id === "viewport" &&
					dockPanel?.group.panels.length === 1 &&
					!isOnSideEdge(dockPanel.api.location)
						? dockPanel.group.element
						: null;
				if (!titleGroup) return null;
				const titleHidden = isDockTitleHidden(titleGroup);
				return (
					<button
						type="button"
						role="menuitem"
						className="fx-dl-item"
						onClick={() => {
							setDockTitleHidden(titleGroup, !titleHidden);
							layoutControl.close();
						}}
					>
						{t(
							titleHidden
								? "dockShell.showPanelTitle"
								: "dockShell.hidePanelTitle",
						)}{" "}
						— {panel.title}
					</button>
				);
			}}
			panels={panels.map((panel) => {
				const Icon = iconForDockPanel(panel.id);
				return { ...panel, icon: <Icon size={13} /> };
			})}
		/>
	);
}

export const PAGE_DOCK_PANEL_IDS = [
	...CORE_PANEL_IDS,
	...OPTIONAL_PANEL_IDS,
] as const;
