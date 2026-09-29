import { createRestartableTimeoutTaskLifecycle } from "@forgeax/app-shell/react";
import {
	Apple,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	CircleGauge,
	Copy,
	Eraser,
	FolderOpen,
	Globe,
	HelpCircle,
	History,
	Info,
	Laptop,
	LayoutGrid,
	Loader2,
	Megaphone,
	MessageSquare,
	Monitor,
	PlayCircle,
	RefreshCw,
	Rocket,
	Settings,
	ShieldAlert,
	Smartphone,
	Trash2,
	UploadCloud,
	Wrench,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { useCommand } from "../../core/app-shell";
import { alertDialog, confirmDialog } from "../../lib/dialog";
import { STORAGE_KEYS } from "../../lib/storageKeys";
import { type UISurfaceActionDef, useSurface } from "../../lib/surface";
import {
	type PendingConfirm,
	useConfirmToast,
} from "../../lib/useConfirmToast";
import {
	getStudioBuildClient,
	getStudioProjectClient,
	useShellStore,
} from "../../store";
import { usePanelRenderers } from "../DockShell/panelRenderers";
import { FeedbackPanel } from "../Feedback/FeedbackPanel";
import { useFeedbackStore } from "../Feedback/store";
import { MenuBar } from "../MenuBar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
	type AndroidPackageConfig,
	AndroidPackageDialog,
} from "./AndroidPackageDialog";
import { type IosPackageConfig, IosPackageDialog } from "./IosPackageDialog";
import { PublishOnboarding } from "./PublishOnboarding";
import { publishDoc } from "./publish-options";
import "./TopBar.css";
import { GameIdentityButton } from "./GameIdentityButton";

function formatPackageError(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function TbDivider() {
	return <span className="tb-divider" aria-hidden="true" />;
}

// DUAL-MODALITY 9.9 — host.toast surface schema. Mirrors the pending-confirm
// list rendered by ConfirmToastList so AI can read what the player currently
// sees as a confirm prompt. allow / deny actions are NOT exposed to AI on
// purpose: AI must not auto-confirm its own pending tool calls.
const HOST_TOAST_SCHEMA = {
	type: "object",
	properties: {
		pending: {
			type: "array",
			items: {
				type: "object",
				required: ["token", "toolId", "callerKind", "receivedAt"],
				properties: {
					token: { type: "string" },
					toolId: { type: "string" },
					callerKind: { type: "string" },
					reason: { type: "string" },
					receivedAt: { type: "number" },
				},
			},
		},
	},
} as const;

interface HostToastSnapshot {
	pending: Array<{
		token: string;
		toolId: string;
		callerKind: string;
		reason?: string;
		receivedAt: number;
	}>;
}

// ConfirmToastList — renders pending tool.confirm-required toasts below the TopBar.
// Each toast shows toolId + caller info plus confirm/deny buttons.
// POST /api/tools/confirm is handled by useConfirmToast's ack/deny callbacks.
interface ConfirmToastListProps {
	confirms: PendingConfirm[];
	onAck: (token: string) => void;
	onDeny: (token: string) => void;
}

function ConfirmToastList({ confirms, onAck, onDeny }: ConfirmToastListProps) {
	if (confirms.length === 0) return null;
	return (
		<div className="tb-confirm-list" role="status" aria-live="polite">
			{confirms.map((c) => (
				<div key={c.token} className="tb-confirm-toast" role="alert">
					<ShieldAlert size={14} className="tb-confirm-icon" />
					<span className="tb-confirm-label">
						<strong>{c.toolId}</strong>
						<span className="tb-confirm-caller">{c.caller.kind}</span>
						{c.message && (
							<span className="tb-confirm-reason">{c.message}</span>
						)}
						{!c.message && c.reason && (
							<span className="tb-confirm-reason">{c.reason}</span>
						)}
					</span>
					<div className="tb-confirm-actions">
						<button
							type="button"
							className="tb-confirm-btn tb-confirm-btn--allow"
							onClick={() => onAck(c.token)}
							title={`Allow tool: ${c.toolId}`}
						>
							<Check size={12} />
							Allow
						</button>
						<button
							type="button"
							className="tb-confirm-btn tb-confirm-btn--deny"
							onClick={() => onDeny(c.token)}
							title={`Deny tool: ${c.toolId}`}
						>
							<X size={12} />
							Deny
						</button>
					</div>
				</div>
			))}
		</div>
	);
}

// PageSwitcher + modeForPage extracted → ./PageSwitcher (§D).

interface EngineRootCandidate {
	path: string;
	label: string;
	valid: boolean;
	recommended: boolean;
}

export function TopBar() {
	const { t } = useTranslation();
	const hasChatSurface = Boolean(usePanelRenderers().panels?.chat);
	const openOverlay = useShellStore((s) => s.openOverlay);
	const activeGameSlug = useShellStore((s) => s.activeGameSlug);
	const chatpanelCollapsed = useShellStore((s) => s.chatpanelCollapsed);
	const toggleChatpanel = useShellStore((s) => s.toggleChatpanel);
	// Route the LayoutGrid button through the command bus so keyboard / palette /
	// iframe all share one entry (was: window.dispatchEvent(APP_EVENTS.dockLayoutToggle)).
	const dockLayoutToggle = useCommand<{
		rect?: { top: number; bottom: number; left: number; right: number };
	}>("app.dock.layoutToggle");
	const [packaging, setPackaging] = useState(false);
	const [packagingPlatform, setPackagingPlatform] = useState("");
	const [rebuildEngine, setRebuildEngine] = useState(false);
	const [engineRoots, setEngineRoots] = useState<EngineRootCandidate[]>([]);
	const [selectedEngineRoot, setSelectedEngineRoot] = useState<
		string | undefined
	>(undefined);
	const [showHistory, setShowHistory] = useState(false);
	const [showProgress, setShowProgress] = useState(false);
	const [progressPhase, setProgressPhase] = useState("");
	const [progressLogs, setProgressLogs] = useState<string[]>([]);
	const [cleaning, setCleaning] = useState(false);
	const [androidDialog, setAndroidDialog] = useState<{
		slug: string;
		defaultAppName: string;
	} | null>(null);
	const [iosDialog, setIosDialog] = useState<{
		slug: string;
		defaultAppName: string;
	} | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [onboardActive, setOnboardActive] = useState(false);
	const { pendingConfirms, ack, deny } = useConfirmToast();

	// Publish dropdown open-state is controlled so the first-run coach-mark can
	// drive it (open it on option steps, close it on the intro). While the tour
	// is active it owns menuOpen entirely — Radix's own open/close requests are
	// ignored. On the very first open we kick off the tour instead.
	const handleMenuOpenChange = (open: boolean) => {
		if (onboardActive) return;
		if (open && !localStorage.getItem(STORAGE_KEYS.publishOnboarded)) {
			localStorage.setItem(STORAGE_KEYS.publishOnboarded, "1");
			setMenuOpen(false);
			setOnboardActive(true);
			return;
		}
		setMenuOpen(open);
	};

	type TargetPlatform = "web" | "windows" | "macos" | "android" | "ios";

	// Detect engine-root candidates for the standalone export. The export script
	// must run inside an engine root that has its deps (vite, @forgeax/*) — the
	// live one is play-runtime, not the legacy engine-src.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const j = await getStudioBuildClient().getEngineRoots();
				if (cancelled) return;
				const roots = (j.roots ?? []) as unknown as EngineRootCandidate[];
				setEngineRoots(roots);
				const recommended =
					roots.find((x) => x.recommended) ?? roots.find((x) => x.valid);
				if (recommended) setSelectedEngineRoot(recommended.path);
			} catch {
				/* leave empty — backend auto-detects on package */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// Package the server-authoritative active game.
	const resolvePackageSlug = async (): Promise<string | null> => {
		let slug = activeGameSlug;
		if (!slug) {
			try {
				const j = await getStudioProjectClient().getActiveProject();
				slug = j.activeSlug ?? null;
			} catch {
				/* fall through */
			}
		}
		return slug ?? null;
	};

	// Android needs user config (applicationId / name / icon / orientation) before
	// packaging, so it opens a dialog first and calls onPackageGame from onConfirm.
	const openAndroidDialog = async () => {
		if (packaging) return;
		const slug = await resolvePackageSlug();
		if (!slug) {
			await alertDialog({
				title: t("topbar.package.title"),
				body: t("topbar.package.noGame"),
			});
			return;
		}
		setAndroidDialog({ slug, defaultAppName: slug });
	};

	// iOS also needs user config (bundleId / name / icon / orientation) before
	// packaging, so it opens a dialog first and calls onPackageGame from onConfirm.
	const openIosDialog = async () => {
		if (packaging) return;
		const slug = await resolvePackageSlug();
		if (!slug) {
			await alertDialog({
				title: t("topbar.package.title"),
				body: t("topbar.package.noGame"),
			});
			return;
		}
		setIosDialog({ slug, defaultAppName: slug });
	};

	const onPackageGame = async (
		platform: TargetPlatform,
		cfg?: AndroidPackageConfig | IosPackageConfig,
	) => {
		if (packaging) return;
		const slug = await resolvePackageSlug();
		if (!slug) {
			await alertDialog({
				title: t("topbar.package.title"),
				body: t("topbar.package.noGame"),
			});
			return;
		}
		setPackaging(true);
		setPackagingPlatform(platform);
		try {
			const j = await getStudioBuildClient().buildProject(slug, {
				targetPlatform: platform,
				rebuildEngine,
				forceRebuild: false,
				engineRoot: selectedEngineRoot,
				...(cfg ?? {}),
			});

			// Async job (Windows / native platforms)
			if (j.async && typeof j.jobId === "string") {
				setShowProgress(true);
				setProgressPhase("starting");
				setProgressLogs([]);
				await pollJob(j.jobId as string, slug!, platform);
				return;
			}

			// Synchronous result (Web)
			if (!j.ok) {
				const detail = formatPackageError(
					j.detail || j.error || t("topbar.package.unknownError"),
				);
				console.error("[packager] build failed", {
					slug,
					platform,
					result: j,
					detail,
				});
				await alertDialog({
					title: t("topbar.package.failed"),
					body: <pre className="tb-package-error">{detail}</pre>,
				});
				return;
			}
			await alertDialog({
				title: t("topbar.package.done", { slug, platform }),
				body: (
					<PackageSuccessBody
						outDir={String(j.outDir ?? "")}
						runHint={String(j.runHint ?? "")}
						platform={platform}
						slug={slug!}
						t={t}
					/>
				),
			});
		} catch (e) {
			const detail = formatPackageError((e as Error)?.message ?? e);
			console.error("[packager] request failed", {
				slug,
				platform,
				error: e,
				detail,
			});
			await alertDialog({
				title: t("topbar.package.failed"),
				body: <pre className="tb-package-error">{detail}</pre>,
			});
		} finally {
			setPackaging(false);
			setPackagingPlatform("");
		}
	};

	const pollJob = async (jobId: string, slug: string, platform: string) => {
		const INTERVAL = 1500;
		const MAX_POLLS = 400;
		for (let i = 0; i < MAX_POLLS; i++) {
			await new Promise((r) => setTimeout(r, INTERVAL));
			try {
				const job = (await getStudioBuildClient().pollBuildJob(
					jobId,
				)) as unknown as {
					status: string;
					phase: string;
					logTail: string[];
					result?: Record<string, unknown>;
				};
				setProgressPhase(job.phase);
				setProgressLogs(job.logTail.slice(-30));

				if (job.status === "success" || job.status === "failed") {
					setShowProgress(false);
					setPackaging(false);
					setPackagingPlatform("");
					if (job.status === "success") {
						const res = job.result ?? {};
						await alertDialog({
							title: t("topbar.package.done", { slug, platform }),
							body: (
								<PackageSuccessBody
									outDir={String(res.outDir ?? "")}
									runHint={String(res.runHint ?? "")}
									platform={platform}
									slug={slug}
									usedCachedShell={Boolean(res.usedCachedShell)}
									t={t}
								/>
							),
						});
					} else {
						const res = job.result ?? {};
						const detail = formatPackageError(
							res.detail || res.error || t("topbar.package.unknownError"),
						);
						console.error("[packager] build failed", {
							slug,
							platform,
							job,
							detail,
						});
						await alertDialog({
							title: t("topbar.package.failed"),
							body: <pre className="tb-package-error">{detail}</pre>,
						});
					}
					return;
				}
			} catch (e) {
				console.error("[packager] polling failed", {
					jobId,
					slug,
					platform,
					error: e,
				});
				/* continue polling */
			}
		}
		setShowProgress(false);
		setPackaging(false);
		setPackagingPlatform("");
	};

	const onRetryPackage = async (slug: string, platform: string) => {
		setPackaging(true);
		setPackagingPlatform(platform);
		setShowHistory(false);
		try {
			const j = await getStudioBuildClient().buildProject(slug, {
				targetPlatform: platform,
				forceRebuild: true,
				engineRoot: selectedEngineRoot,
			});
			if (j.async && typeof j.jobId === "string") {
				setShowProgress(true);
				setProgressPhase("starting");
				setProgressLogs([]);
				await pollJob(j.jobId as string, slug, platform);
			}
		} catch (e) {
			const detail = formatPackageError((e as Error)?.message ?? e);
			console.error("[packager] retry failed", {
				slug,
				platform,
				error: e,
				detail,
			});
			await alertDialog({
				title: t("topbar.package.failed"),
				body: <pre className="tb-package-error">{detail}</pre>,
			});
		} finally {
			setPackaging(false);
			setPackagingPlatform("");
		}
	};

	const onCleanCache = async () => {
		if (packaging) return;
		if (
			!(await confirmDialog({
				title: t("topbar.package.cleanTitle"),
				body: (
					<div style={{ fontSize: 13, lineHeight: 1.6 }}>
						<div>{t("topbar.package.cleanBody")}</div>
						<ul style={{ margin: "6px 0 0", paddingLeft: 18, opacity: 0.85 }}>
							<li>{t("topbar.package.cleanItemToolchain")}</li>
							<li>{t("topbar.package.cleanItemShell")}</li>
							<li>{t("topbar.package.cleanItemTmp")}</li>
						</ul>
						<div style={{ marginTop: 8, opacity: 0.7 }}>
							{t("topbar.package.cleanKeepHint")}
						</div>
					</div>
				),
				danger: true,
				confirmText: t("topbar.package.cleanConfirm"),
			}))
		)
			return;

		setCleaning(true);
		try {
			const j = await getStudioBuildClient().cleanBuilds();
			const fmtSize = (b: number): string => {
				if (b <= 0) return "0 B";
				const u = ["B", "KB", "MB", "GB"];
				let i = 0;
				let n = b;
				while (n >= 1024 && i < u.length - 1) {
					n /= 1024;
					i++;
				}
				return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
			};
			const anyError = j.targets.some((tg) => Boolean(tg.error));
			setCleaning(false);
			await alertDialog({
				title: anyError
					? t("topbar.package.cleanPartial")
					: t("topbar.package.cleanDone"),
				body: (
					<div style={{ fontSize: 13, lineHeight: 1.6 }}>
						<div>
							{t("topbar.package.cleanFreed", { size: fmtSize(j.totalBytes) })}
						</div>
						<ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
							{j.targets.map((tg) => (
								<li key={tg.path} style={{ opacity: tg.existed ? 1 : 0.5 }}>
									{tg.error ? "✗" : tg.removed ? "✓" : "·"} {tg.path}
									{tg.removed && tg.bytes > 0 ? ` (${fmtSize(tg.bytes)})` : ""}
									{tg.error ? ` — ${tg.error}` : ""}
								</li>
							))}
						</ul>
					</div>
				),
			});
		} catch (e) {
			setCleaning(false);
			await alertDialog({
				title: t("topbar.package.cleanFailed"),
				body: String((e as Error)?.message ?? e),
			});
		}
	};

	// DUAL-MODALITY 9.9 — register host.toast surface so the AI can read the
	// pending-confirm prompts the player currently sees. Snapshot mirrors
	// pendingConfirms (slim shape — drops the caller blob besides kind). Actions
	// allow/deny are exposedToAI=false to prevent AI from greenlighting its own
	// gated tool calls; only the player path (button click) drives them.
	const toastPendingSlim = useMemo<HostToastSnapshot["pending"]>(
		() =>
			pendingConfirms.map((c) => ({
				token: c.token,
				toolId: c.toolId,
				callerKind: c.caller.kind,
				reason: c.reason,
				receivedAt: c.receivedAt,
			})),
		[pendingConfirms],
	);
	const toastSurface = useSurface<
		HostToastSnapshot,
		Record<string, UISurfaceActionDef>
	>({
		id: "host.toast",
		layer: "host",
		schema: HOST_TOAST_SCHEMA as unknown as Record<string, unknown>,
		initialSnapshot: { pending: toastPendingSlim },
		actions: {
			allow: {
				id: "allow",
				exposedToAI: false,
				argsSchema: {
					type: "object",
					required: ["token"],
					properties: { token: { type: "string" } },
				},
				run: (raw) => {
					const a = (raw ?? {}) as { token?: unknown };
					if (typeof a.token !== "string") return;
					void ack(a.token);
				},
			},
			deny: {
				id: "deny",
				exposedToAI: false,
				argsSchema: {
					type: "object",
					required: ["token"],
					properties: { token: { type: "string" } },
				},
				run: (raw) => {
					const a = (raw ?? {}) as { token?: unknown };
					if (typeof a.token !== "string") return;
					void deny(a.token);
				},
			},
		},
	});
	useEffect(() => {
		toastSurface.setSnapshot({ pending: toastPendingSlim });
	}, [toastPendingSlim, toastSurface.setSnapshot]);
	// 2026-05-21 — TopBar 不再渲染模型选择器。原本 tb-right 挂了
	// `<ModelPicker variant="pill">` 当真实选择器,但 Composer 底部也有一份,
	// 两个 picker 各自跟 agent.json 异步轮询时会出现展示不一致(顶部还显示
	// 上一次的 selected,底部已经切了),用户明确反馈"为什么有好几个选模型
	// 的地方"。SSOT 收回 Composer (`ChatPanel/Composer.tsx <ModelPicker>`),
	// TopBar 只留 Settings 入口和 cli-provider admin 快捷键。
	// 2026-05-17 — useBusExtensionCount / usePageExtensionCount / usePreviewWsCount
	// hooks no longer wired (count badges were removed). The function bodies are
	// kept in this file for the moment in case future TopBar widgets want them;
	// the unused-imports lint warning is tolerated.
	// provHealth / mbCount hooks removed — pills collapsed to icon buttons (no count badges).
	// Workspace tabs replace the old fixed mode tabs.
	return (
		<>
			<div className="topbar" data-tour-id="topbar">
				<div className="tb-left" data-tour-id="tb-left">
					{/* Decorative macOS-style traffic dots — 2026-07-08 removed.
           Browser: the browser window itself already has real traffic lights
           at the OS level, so drawing our own inside the app chrome is a
           visual dup. Tauri: OS draws the real (functional) ones, same dup.
           Neither host needs fake dots; they were a P4.65 skin holdover. */}
					{/* 2026-06-02 — removed the standalone "+" (NewMenu): its "新建 game" /
            "新建 session" duplicated the per-selector create actions. Each
            selector now owns its own pinned "新建 X": workspace → ProjectSwitcher,
            game → GameSwitcher, session → SessionSwitcher. */}
					<MenuBar />
					<GameIdentityButton />
				</div>

				<div className="tb-right" data-tour-id="tb-right">
					{/* 需求 §1:反馈入口位于对话流按钮左侧 —— tb-right 从左往右排,
            所以反馈必须排在 chat-panel-toggle 之前,勿调换。 */}
					<button
						type="button"
						className="tb-feedback-btn"
						title={t("feedback.tooltip")}
						onClick={() => useFeedbackStore.getState().openPanel("write")}
					>
						<Megaphone size={16} />
						<span>{t("feedback.button")}</span>
					</button>
					<TbDivider />
					{hasChatSurface && (
						<button
							type="button"
							className="tb-icon-btn"
							data-testid="chat-panel-toggle"
							aria-label={t(
								chatpanelCollapsed
									? "topbar.chatToggle.expand"
									: "topbar.chatToggle.collapse",
							)}
							aria-pressed={!chatpanelCollapsed}
							title={t(
								chatpanelCollapsed
									? "topbar.chatToggle.expand"
									: "topbar.chatToggle.collapse",
							)}
							onClick={toggleChatpanel}
						>
							<MessageSquare
								size={16}
								fill={chatpanelCollapsed ? "none" : "currentColor"}
								stroke={chatpanelCollapsed ? "currentColor" : "none"}
							/>
						</button>
					)}
					{hasChatSurface && <TbDivider />}
					<DashboardToggle />
					<TbDivider />
					<button
						type="button"
						className="tb-icon-btn"
						title={t("topbar.layout.tooltip")}
						onClick={(e) => {
							const r = e.currentTarget.getBoundingClientRect();
							void dockLayoutToggle({
								rect: {
									top: r.top,
									bottom: r.bottom,
									left: r.left,
									right: r.right,
								},
							});
						}}
					>
						<LayoutGrid size={16} />
					</button>
					<TbDivider />
					<button
						type="button"
						className="tb-icon-btn"
						onClick={() => openOverlay("settings")}
						title={t("topbar.settings.tooltip")}
					>
						<Settings size={16} />
					</button>
					<TbDivider />
					<DropdownMenu
						open={menuOpen}
						onOpenChange={handleMenuOpenChange}
						modal={false}
					>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="tb-publish-btn"
								disabled={packaging}
								title={
									packaging
										? t("topbar.publish.packaging", {
												platform: packagingPlatform,
											})
										: t("topbar.publish.tooltip")
								}
							>
								<Rocket size={16} />
								<ChevronDown
									size={10}
									style={{ marginLeft: 2, opacity: 0.6 }}
								/>
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							sideOffset={6}
							className="tb-publish-menu"
						>
							<DropdownMenuLabel>
								{t("topbar.package.menuTitle")}
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								data-onboard="web"
								title={publishDoc(t, "web").what}
								onClick={() => onPackageGame("web")}
							>
								<Globe size={14} />
								<span className="tb-mi-txt">
									<span className="tb-mi-title">
										{t("topbar.package.platformWeb")}
									</span>
									<span className="tb-mi-sub">{publishDoc(t, "web").when}</span>
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								data-onboard="windows"
								title={publishDoc(t, "windows").what}
								onClick={() => onPackageGame("windows")}
							>
								<Monitor size={14} />
								<span className="tb-mi-txt">
									<span className="tb-mi-title">
										{t("topbar.package.platformWindows")}
									</span>
									<span className="tb-mi-sub">
										{publishDoc(t, "windows").when}
									</span>
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								data-onboard="macos"
								title={publishDoc(t, "macos").what}
								onClick={() => onPackageGame("macos")}
							>
								<Laptop size={14} />
								<span className="tb-mi-txt">
									<span className="tb-mi-title">
										{t("topbar.package.platformMac")}
									</span>
									<span className="tb-mi-sub">
										{publishDoc(t, "macos").when}
									</span>
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								data-onboard="android"
								disabled={packaging}
								title={publishDoc(t, "android").what}
								onClick={() => {
									void openAndroidDialog();
								}}
							>
								<Smartphone size={14} />
								<span className="tb-mi-txt">
									<span className="tb-mi-title">
										{t("topbar.package.platformAndroid")}
									</span>
									<span className="tb-mi-sub">
										{publishDoc(t, "android").when}
									</span>
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								data-onboard="ios"
								disabled={packaging}
								title={publishDoc(t, "ios").what}
								onClick={() => {
									void openIosDialog();
								}}
							>
								<Apple size={14} />
								<span className="tb-mi-txt">
									<span className="tb-mi-title">
										{t("topbar.package.platformIos")}
									</span>
									<span className="tb-mi-sub">{publishDoc(t, "ios").when}</span>
								</span>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							{/* Coming soon — one-click cloud/platform publish is a grayed placeholder. */}
							<DropdownMenuItem disabled title={publishDoc(t, "cloud").what}>
								<UploadCloud size={14} />
								<span className="tb-mi-txt">
									<span className="tb-mi-title">
										{t("topbar.package.platformCloud")}
									</span>
									<span className="tb-mi-sub">
										{t("topbar.package.comingSoon")}
									</span>
								</span>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuLabel
								style={{ fontSize: 11, opacity: 0.6 }}
								title={publishDoc(t, "engineRoot").what}
							>
								{t("topbar.package.engineRoot")}
							</DropdownMenuLabel>
							{engineRoots.length === 0 ? (
								<DropdownMenuItem
									disabled
									style={{ fontSize: 11, opacity: 0.5 }}
								>
									{t("topbar.package.engineRootNone")}
								</DropdownMenuItem>
							) : (
								engineRoots.map((root) => (
									<DropdownMenuItem
										key={root.path}
										disabled={!root.valid}
										onClick={(e) => {
											e.preventDefault();
											if (root.valid) setSelectedEngineRoot(root.path);
										}}
										style={{ gap: 6, opacity: root.valid ? 1 : 0.45 }}
										title={root.path}
									>
										<span
											style={{
												flex: 1,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{root.label}
											{!root.valid && (
												<span
													style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}
												>
													({t("topbar.package.engineRootInvalid")})
												</span>
											)}
										</span>
										<span
											style={{
												width: 14,
												height: 14,
												borderRadius: 3,
												border: "1px solid #666",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												fontSize: 10,
											}}
										>
											{selectedEngineRoot === root.path ? "✓" : ""}
										</span>
									</DropdownMenuItem>
								))
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								data-onboard="engine"
								title={publishDoc(t, "engine").what}
								onClick={(e) => {
									e.preventDefault();
									setRebuildEngine(!rebuildEngine);
								}}
								style={{ gap: 6 }}
							>
								<Wrench size={14} />
								<span className="tb-mi-txt">
									<span className="tb-mi-title">
										{t("topbar.package.rebuildEngine")}
									</span>
									<span className="tb-mi-sub">
										{publishDoc(t, "engine").when}
									</span>
								</span>
								<span
									style={{
										width: 14,
										height: 14,
										borderRadius: 3,
										border: "1px solid #666",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontSize: 10,
									}}
								>
									{rebuildEngine ? "✓" : ""}
								</span>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								data-onboard="history"
								title={publishDoc(t, "history").what}
								onClick={() => setShowHistory(true)}
							>
								<History size={14} />
								{t("topbar.package.history")}
							</DropdownMenuItem>
							<DropdownMenuItem
								data-onboard="clean"
								title={publishDoc(t, "clean").what}
								onClick={(e) => {
									e.preventDefault();
									void onCleanCache();
								}}
								style={{ gap: 6, color: "var(--destructive, #e05260)" }}
							>
								<Eraser size={14} />
								{t("topbar.package.clean")}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={(e) => {
									e.preventDefault();
									setOnboardActive(true);
								}}
							>
								<HelpCircle size={14} />
								{t("topbar.package.viewGuide")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<PublishOnboarding
						active={onboardActive}
						onClose={() => setOnboardActive(false)}
						setMenuOpen={setMenuOpen}
						t={t}
					/>
				</div>
			</div>
			<ConfirmToastList confirms={pendingConfirms} onAck={ack} onDeny={deny} />
			<FeedbackPanel />
			{cleaning && (
				<div className="tb-progress-overlay">
					<div className="tb-progress-dialog">
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<Loader2 size={16} className="tb-spinner" />
							<span style={{ fontWeight: 600 }}>
								{t("topbar.package.cleaning")}
							</span>
						</div>
						<div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
							{t("topbar.package.cleaningHint")}
						</div>
					</div>
				</div>
			)}
			{showProgress && (
				<PackageProgressOverlay
					phase={progressPhase}
					logs={progressLogs}
					platform={packagingPlatform}
					onClose={() => {
						setShowProgress(false);
					}}
					t={t}
				/>
			)}
			{showHistory && (
				<PackageHistoryDialog
					onClose={() => setShowHistory(false)}
					onRetry={onRetryPackage}
					t={t}
				/>
			)}
			{androidDialog && (
				<AndroidPackageDialog
					slug={androidDialog.slug}
					defaultAppName={androidDialog.defaultAppName}
					t={t}
					onCancel={() => setAndroidDialog(null)}
					onConfirm={(cfg) => {
						setAndroidDialog(null);
						void onPackageGame("android", cfg);
					}}
				/>
			)}
			{iosDialog && (
				<IosPackageDialog
					slug={iosDialog.slug}
					defaultAppName={iosDialog.defaultAppName}
					t={t}
					onCancel={() => setIosDialog(null)}
					onConfirm={(cfg) => {
						setIosDialog(null);
						void onPackageGame("ios", cfg);
					}}
				/>
			)}
		</>
	);
}

// GameSwitcher + NewGameModal + timeSince extracted → ./GameSwitcher (§D).

// ── PackageSuccessBody ──
// The body of the "packaging done" dialog. Turns the old read-only outDir /
// runHint text into actionable buttons: one-click playtest (web), open the
// product folder in the OS file manager, and copy the path / run command.
function PackageSuccessBody({
	outDir,
	runHint,
	platform,
	slug,
	usedCachedShell,
	t,
}: {
	outDir: string;
	runHint: string;
	platform: string;
	slug: string;
	usedCachedShell?: boolean;
	t: (k: string, opts?: Record<string, string | number>) => string;
}) {
	const [copied, setCopied] = useState<"path" | "cmd" | null>(null);
	const copiedResetTaskRef = useRef<ReturnType<
		typeof createRestartableTimeoutTaskLifecycle
	> | null>(null);

	useEffect(() => {
		const task = createRestartableTimeoutTaskLifecycle({
			delayMs: 1600,
			task: () => setCopied(null),
		});
		copiedResetTaskRef.current = task;
		return () => {
			copiedResetTaskRef.current = null;
			task.dispose();
		};
	}, []);

	const copy = async (text: string, which: "path" | "cmd") => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(which);
			copiedResetTaskRef.current?.schedule();
		} catch {
			/* ignore */
		}
	};
	const reveal = async () => {
		try {
			await fetch("/api/builds/reveal", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: outDir }),
			});
		} catch {
			/* ignore */
		}
	};
	// Playtest is served by the studio server itself (same-origin, secure
	// localhost context, correct .wasm MIME) — no npx/serve.sh spawn, so the tab
	// opens instantly onto a ready server instead of a maybe-not-bound one.
	const play = () => {
		window.open(`/api/builds/play/${encodeURIComponent(slug)}/`, "_blank");
	};

	const isWeb = platform === "web";

	return (
		<div className="tb-pkg-success">
			<div className="tb-pkg-head">
				<CheckCircle2 size={20} className="tb-pkg-head-ic" />
				<span className="tb-pkg-head-txt">
					{t("topbar.package.success.ready")}
				</span>
			</div>

			<div className="tb-pkg-path">
				<FolderOpen size={14} className="tb-pkg-path-ic" />
				<code className="tb-pkg-path-txt">{outDir}</code>
			</div>

			<div className="tb-success-actions">
				{isWeb && (
					<button type="button" className="tb-sa-btn primary" onClick={play}>
						<PlayCircle size={18} />
						<span>{t("topbar.package.success.play")}</span>
					</button>
				)}
				<button
					type="button"
					className={`tb-sa-btn${isWeb ? "" : " primary"}`}
					onClick={() => {
						void reveal();
					}}
				>
					<FolderOpen size={18} />
					<span>{t("topbar.package.success.open")}</span>
				</button>
				<button
					type="button"
					className="tb-sa-btn"
					onClick={() => {
						void copy(outDir, "path");
					}}
				>
					{copied === "path" ? <Check size={18} /> : <Copy size={18} />}
					<span>
						{copied === "path"
							? t("topbar.package.success.copied")
							: t("topbar.package.success.copyPath")}
					</span>
				</button>
				{runHint && (
					<button
						type="button"
						className="tb-sa-btn"
						onClick={() => {
							void copy(runHint, "cmd");
						}}
					>
						{copied === "cmd" ? <Check size={18} /> : <Copy size={18} />}
						<span>
							{copied === "cmd"
								? t("topbar.package.success.copied")
								: t("topbar.package.success.copyCmd")}
						</span>
					</button>
				)}
			</div>

			{runHint && (
				<details className="tb-pkg-cmd">
					<summary>
						<ChevronRight size={13} className="tb-pkg-cmd-caret" />
						{t("topbar.package.runLocally")}
					</summary>
					<pre>{runHint}</pre>
				</details>
			)}

			{usedCachedShell && (
				<div className="tb-pkg-hint">
					<Info size={13} />
					<span>{t("topbar.package.cachedShell")}</span>
				</div>
			)}
			{isWeb && (
				<div className="tb-pkg-hint">
					<Info size={13} />
					<span>{t("topbar.package.webgpuHint")}</span>
				</div>
			)}
		</div>
	);
}

// ── PackageProgressOverlay ──
// A polished "packaging in progress" card: an animated orb + humanized phase
// label, an indeterminate shimmer bar (we have no % from the backend), the
// latest build line, a reassuring hint, and a collapsible terminal log.
function PackageProgressOverlay({
	phase,
	logs,
	platform,
	onClose,
	t,
}: {
	phase: string;
	logs: string[];
	platform?: string;
	onClose: () => void;
	t: (k: string, opts?: Record<string, string | number>) => string;
}) {
	const logsRef = useRef<HTMLPreElement>(null);
	const [showLogs, setShowLogs] = useState(false);
	const logText = logs.join("\n");
	useEffect(() => {
		if (!showLogs || !logText) return;
		if (logsRef.current)
			logsRef.current.scrollTop = logsRef.current.scrollHeight;
	}, [logText, showLogs]);

	// Humanize the phase; fall back to the raw phase if no label key exists.
	const labelKey = `topbar.package.phaseLabel.${phase}`;
	const label = t(labelKey);
	const phaseText =
		label === labelKey || label.startsWith("topbar.") ? phase : label;
	const lastLine = logs.length ? logs[logs.length - 1] : "";

	return (
		<div
			className="tb-progress-overlay"
			role="dialog"
			aria-modal="true"
			aria-label={t("topbar.package.progressTitle")}
			tabIndex={-1}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<div className="tb-progress-dialog tb-prog">
				<div className="tb-prog-head">
					<span className="tb-prog-orb">
						<Loader2 size={20} className="tb-spinner" />
					</span>
					<div className="tb-prog-headtxt">
						<div className="tb-prog-title">
							{t("topbar.package.progressTitle")}
							{platform && <span className="tb-prog-badge">{platform}</span>}
						</div>
						<div className="tb-prog-phase">{phaseText}</div>
					</div>
				</div>

				<div className="tb-prog-bar" role="progressbar" aria-label={phaseText}>
					<span />
				</div>

				{lastLine && <div className="tb-prog-line">{lastLine}</div>}
				<div className="tb-prog-hint">{t("topbar.package.progressHint")}</div>

				<details
					className="tb-prog-logbox"
					onToggle={(e) =>
						setShowLogs((e.currentTarget as HTMLDetailsElement).open)
					}
				>
					<summary>
						<ChevronRight size={13} className="tb-prog-caret" />
						{t("topbar.package.progressLogs")}
					</summary>
					<pre ref={logsRef}>{logText || "…"}</pre>
				</details>

				<div className="tb-prog-foot">
					<button type="button" className="tb-prog-close" onClick={onClose}>
						{t("topbar.package.progressClose")}
					</button>
				</div>
			</div>
		</div>
	);
}

// ── PackageHistoryDialog ──
interface HistoryRecord {
	id: string;
	slug: string;
	platform: string;
	status: "success" | "failed";
	createdAt: number;
	durationMs: number;
	outDir?: string;
	error?: string;
	usedCachedShell?: boolean;
	rebuiltEngine?: boolean;
}

function PackageHistoryDialog({
	onClose,
	onRetry,
	t,
}: {
	onClose: () => void;
	onRetry: (slug: string, platform: string) => void;
	t: (k: string, opts?: Record<string, string | number>) => string;
}) {
	const [records, setRecords] = useState<HistoryRecord[]>([]);
	const [loading, setLoading] = useState(true);

	const fetchHistory = useCallback(async () => {
		try {
			const j = await getStudioBuildClient().listBuildHistory();
			setRecords((j.records ?? []) as unknown as HistoryRecord[]);
		} catch {
			/* empty */
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void fetchHistory();
	}, [fetchHistory]);

	const handleDelete = async (id: string) => {
		try {
			await getStudioBuildClient().deleteBuildHistory(id, { clean: true });
			setRecords((prev) => prev.filter((r) => r.id !== id));
		} catch {
			/* ignore */
		}
	};

	const fmtDate = (ts: number) => new Date(ts).toLocaleString();
	const fmtDuration = (ms: number) =>
		ms >= 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`;

	return (
		<div
			className="tb-progress-overlay"
			role="dialog"
			aria-modal="true"
			aria-label={t("topbar.package.historyTitle")}
			tabIndex={-1}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<div
				className="tb-progress-dialog"
				style={{ minWidth: 420, maxHeight: "70vh" }}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginBottom: 12,
					}}
				>
					<span style={{ fontWeight: 600, fontSize: 14 }}>
						{t("topbar.package.history")}
					</span>
					<button
						type="button"
						onClick={onClose}
						style={{
							fontSize: 12,
							cursor: "pointer",
							background: "none",
							border: "none",
							color: "inherit",
						}}
					>
						✕
					</button>
				</div>
				{loading && (
					<div style={{ textAlign: "center", padding: 20, opacity: 0.6 }}>
						…
					</div>
				)}
				{!loading && records.length === 0 && (
					<div style={{ textAlign: "center", padding: 20, opacity: 0.6 }}>
						{t("topbar.package.historyEmpty")}
					</div>
				)}
				<div style={{ overflowY: "auto", maxHeight: "calc(70vh - 80px)" }}>
					{records.map((rec) => (
						<div
							key={rec.id}
							style={{
								padding: "8px 10px",
								borderBottom: "1px solid rgba(255,255,255,0.06)",
								display: "flex",
								alignItems: "center",
								gap: 8,
								fontSize: 12,
							}}
						>
							<span
								style={{
									width: 8,
									height: 8,
									borderRadius: "50%",
									background: rec.status === "success" ? "#4ade80" : "#f87171",
									flexShrink: 0,
								}}
							/>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ fontWeight: 500 }}>
									{rec.slug} — {rec.platform}
									{rec.usedCachedShell && (
										<span style={{ opacity: 0.5, marginLeft: 4 }}>
											(cached)
										</span>
									)}
								</div>
								<div style={{ opacity: 0.6 }}>
									{fmtDate(rec.createdAt)} · {fmtDuration(rec.durationMs)}
									{rec.error && (
										<span style={{ color: "#f87171", marginLeft: 4 }}>
											{rec.error.slice(0, 60)}
										</span>
									)}
								</div>
							</div>
							{rec.status === "failed" && (
								<button
									type="button"
									onClick={() => onRetry(rec.slug, rec.platform)}
									style={{
										fontSize: 11,
										cursor: "pointer",
										display: "flex",
										alignItems: "center",
										gap: 3,
										padding: "2px 6px",
										borderRadius: 3,
										border: "1px solid rgba(255,255,255,0.15)",
										background: "transparent",
										color: "inherit",
									}}
									title={t("topbar.package.historyRetry")}
								>
									<RefreshCw size={11} /> {t("topbar.package.historyRetry")}
								</button>
							)}
							<button
								type="button"
								onClick={() => handleDelete(rec.id)}
								style={{
									fontSize: 11,
									cursor: "pointer",
									display: "flex",
									alignItems: "center",
									gap: 3,
									padding: "2px 6px",
									borderRadius: 3,
									border: "1px solid rgba(255,255,255,0.1)",
									background: "transparent",
									color: "inherit",
									opacity: 0.6,
								}}
								title={t("topbar.package.historyDelete")}
							>
								<Trash2 size={11} />
							</button>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function DashboardToggle() {
	const dashboardOpen = useShellStore((s) => s.activeOverlay === "dashboard");
	const openOverlay = useShellStore((s) => s.openOverlay);
	const closeOverlay = useShellStore((s) => s.closeOverlay);
	return (
		<button
			type="button"
			className={`tb-icon-btn${dashboardOpen ? " active" : ""}`}
			onClick={() =>
				dashboardOpen ? closeOverlay() : openOverlay("dashboard")
			}
			title="Dashboard — Run/Thread/Provider monitoring"
		>
			<CircleGauge size={16} />
		</button>
	);
}
