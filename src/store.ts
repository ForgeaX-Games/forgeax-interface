import { create } from 'zustand';
import { t } from '@/i18n';
import { recordLog } from './lib/logSink';
import { alertDialog } from './lib/dialog';
import { getWindowManager, surfaceKey, type SurfaceDescriptor } from './lib/platform';
import { bootAppMode } from './lib/workspaces';

// P2.6d — 'bus' joins as a top-level mode for the Bus admin panel.
// Mirrors the Viewport / Workbench switch in the TopBar; rendered by MainArea.
// 2026-06-30: 'preview'/'play' removed; 'edit' retained as the 2x2 viewport workspace (OOS-5).
export type AppMode = 'edit' | 'workbench' | 'bus';

// Shared file descriptor used by the multi-tab workbench editor.
export interface PreviewFile {
  path: string;
  kind: 'text' | 'image' | 'audio' | 'video' | 'model' | 'binary';
  mime: string;
  bytes: number;
  content?: string;
  dirty?: boolean;
  error?: string;
}

export interface ToolCall {
  callId: string;
  name: string;
  args: unknown;
  status: 'running' | 'done' | 'error';
  result?: string;
  error?: string;
  // Snapshot of m.text.length when this tool-call event arrived. Lets the UI
  // render tool chips inline at their chronological position in the response
  // (mimicking vag_web's parts[] flow) instead of dumping all chips at the end.
  at?: number;
  /** When this tool_call is `name='subagent'`, the launched sub-agent's id.
   *  ForgeCard uses this to associate the chip with the inline SubAgentCard
   *  rendered from chatMsg.subAgents[subagentId]. */
  subagentId?: string;
}

export interface LiveAgent {
  path: string;
  display: string;
  parent: string | null;
  running: boolean;
  depth: number;
}

export interface AgentFileTouch {
  callId: string;
  path: string;
  name: string;
  op: string;
  ts: number;
  status: 'running' | 'done' | 'error';
}

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  text: string;
  ts: number;
}

export interface NetworkEntry {
  kind: 'fetch' | 'xhr' | 'ws';
  method: string;
  url: string;
  status: number;
  ms: number;
  ok: boolean;
  ts: number;
}

// ── Observability (trace + log) telemetry ───────────────────────────────────
// Wire shapes MIRROR `@forgeax/types`'s observability schema (SpanData /
// LogRecord / TelemetryRecord). interface has no dep on @forgeax/types, so the
// line shape is re-declared locally as plain TS (Schema-as-Contract lives in
// packages/types; this is the consumer-side view). Both信道 feed the SAME slice:
//   - node→server→WS  `{ type:'telemetry',     records }`  (handleDaemonWs)
//   - iframe→shell     `{ type:'VAG_TELEMETRY', records }`  (healthBridge)
// 见 .claude/docs/架构设计/forgeax-os/可观测性-trace-log-v3-B档-并行执行计划-2026-06-24.md §B。
export interface TelemetrySpan {
  kind: 'span';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTs: number;
  /** 缺失 = provisional(onStart 临时态),渲染成「进行中」。 */
  endTs?: number;
  provisional?: boolean;
  attrs?: Record<string, unknown>;
  events?: Array<{ name: string; ts: number; attrs?: Record<string, unknown> }>;
  status?: { code: 'ok' | 'error'; message?: string };
  sid?: string;
  agentId?: string;
}

export interface TelemetryLog {
  kind: 'log';
  ts: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
  fields?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  sid?: string;
  agentId?: string;
}

export type TelemetryRecord = TelemetrySpan | TelemetryLog;

export interface SubAgentRun {
  emitterId: string;
  text: string;
  thinking?: string;
  toolCalls: ToolCall[];
  status: 'streaming' | 'done' | 'error';
  startedAt: number;
  /** Which CliProvider streamed this run (forgeax, claude-code, ...).
   *  Surfaced as a badge on <SubAgentCard>. Per docs/CLI-PROVIDERS-DESIGN.md. */
  providerId?: string;
}

/**
 * Time-ordered segment of an assistant message — text / thinking / tool —
 * rendered in arrival order so reasoning, tool calls and prose interleave
 * the way they actually streamed.
 *
 *   ts             arrival timestamp (ms epoch); sort key for the render
 *   kind=text      append-only markdown chunk
 *   kind=thinking  append-only reasoning/thinking chunk
 *   kind=tool      tool call (lifecycle: running → done/error); same id is
 *                  reused as args/result deltas land
 *
 * Adjacent same-kind segments (text/thinking) are coalesced into one chunk
 * by `appendChatSegment`, so the array stays short even on multi-thousand
 * token streams.  Tool segments never coalesce — each call gets its own.
 */
export type ChatSegment =
  | { kind: 'text'; ts: number; text: string }
  | { kind: 'thinking'; ts: number; text: string }
  | { kind: 'tool'; ts: number; tool: ToolCall };

/** System message visual categories — matches ink-renderer's SystemLine.
 *  Used when role === 'system' to drive icon/color in ChatPanel.
 *
 *  - direction: 来信(incoming, 📨) / 出信(outgoing, 📤) — inter-agent traffic
 *  - level:     info / warning(⚠) / error(✖)
 *  - source:    short tag e.g. "agent:foo(inbound_message)", rendered before ':'
 *  - from / to: agent ids (purely informational; UI may show as subtitle) */
export type SystemLevel = 'info' | 'warning' | 'error';
export type SystemDirection = 'incoming' | 'outgoing';

/** One client-side queued message awaiting its turn (Cursor-style queue). */
export interface QueuedMessage {
  id: string;
  text: string;
  ts: number;
}

/** Options for sendMessage. `handoff: 'steer'` performs an interrupt-send:
 *  the message is delivered immediately with EventQueue handoff 'steer', which
 *  aborts the running turn and processes the new message next — instead of
 *  queueing it behind the current turn. */
export interface SendMessageOpts {
  handoff?: 'steer';
  /** 多模态附件(图片)。每项 `{ kind:'image', mediaType, data(base64 或 dataUrl) }`。
   *  透传进 /api/sessions/:sid/messages 的 payload → 内核 facade 组 image block(forgeax-core)。 */
  attachments?: Array<Record<string, unknown>>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  /** checkpoint 回退点外键(role='user' 才有;server /messages 注入并回传)。
   *  有它且 server 侧存在对应 checkpoint 记录时,气泡 hover 出「回到这里」。 */
  msgId?: string;
  text: string;
  thinking?: string;
  toolCalls: ToolCall[];
  /** role='system' visual classification — drives icon / color in ChatPanel. */
  level?: SystemLevel;
  direction?: SystemDirection;
  /** role='system' — short source tag (e.g. `admin(message)`) printed inline. */
  source?: string;
  /** role='system' — emitter agent id, for inter-agent traffic. */
  from?: string;
  /** role='system' — recipient agent id, for inter-agent traffic. */
  to?: string;
  /** Time-ordered render units — text / thinking / tool interleaved.  When
   *  populated ForgeCard renders from this instead of the legacy
   *  text+thinking+toolCalls three-field layout, fixing the bug where tools
   *  visually "jump" because their position is anchored to a snapshot of
   *  text length rather than to their own timestamp.  Built by both the
   *  live SSE pipeline and the replay path. */
  segments?: ChatSegment[];
  /** Sub-agent runs that spawned during this turn — keyed by emitterId. */
  subAgents?: Record<string, SubAgentRun>;
  status: 'streaming' | 'done' | 'error';
  ts: number;
  errorMessage?: string;
  /** Which CliProvider streamed the main message (forgeax / claude-code / ...).
   *  Captured from payload.providerId on the first main-emitter event. */
  providerId?: string;
  /** Final cost (USD) of this turn — populated from SSE 'done' if provider
   *  surfaced it (currently only claude-code's result.total_cost_usd). */
  cost?: number;
  /** Wall-clock duration (ms) of this turn — populated from SSE 'done' when
   *  provider includes duration_ms. Falls back to local elapsed otherwise. */
  durationMs?: number;
}

/**
 * One chat thread tab.
 *
 * 2026-05-20 重做（彻底版）：
 *  - 此前 tab 是独立前端实体（id 是前端 newId、threadId/sessionId 可为 null、
 *    localStorage 持久化整张 tabs 数组），跟后端 sessions 形成「双重账本」——
 *    session 删了 tab 还在、boot 创了 session 但 tab.threadId 还是 null、
 *    `?? 'forgeax'` fallback 等一切恶心问题的根源。
 *  - 新模型：**每个 tab 就是一个 server session 的视图**。`sid` 是非空主键、
 *    DOM key、`_abortByTab` key、WS routing key —— 单一标识。
 *    - `id / threadId / sessionId / title` 字段全部下线。
 *    - boot 时不再造任何"无 sid scratch tab"。tabs 完全等于 GET /api/sessions
 *      的派生 view；空 → store action `initSessions` 自动建一条；CRUD 全部
 *      走后端 REST（POST/DELETE /api/sessions）。
 *    - localStorage 只缓存 `forgeax.activeSid`，不再持久化 tabs 数组本身。
 *      老 key (`forgeax.tabs`/`forgeax.activeTabId`) 启动一次性 cleanup。
 */
export interface ChatTab {
  /** Server session id —— 唯一主键。tab 与 session 一一对应。 */
  sid: string;
  /** Server 端 session.json::displayName。可能 undefined（boot-time auto-create
   *  / 用户没传名）—— UI 渲染规则：`tab.displayName ?? \`session ${sid.slice(0,6)}\``。
   *  改名等 server 端 PATCH 接口落地后接，先只读。 */
  displayName: string | undefined;
  /** Which agent this tab is bound to. First-class key for chat state:
   *  every WAL replay, every live-SSE routing decision, the AgentSwitcher
   *  highlight, the Composer hint — all derive from this. null means
   *  "fresh tab, no agent chosen yet"; the AgentSwitcher fills it in once
   *  list_agents resolves (defaulting to the root agent). */
  agentId: string | null;
  providerOverride: string | null;
  /** Epoch ms of the session's last on-disk activity (server-side: newest
   *  mtime under `<session>/agents/`). Mirrored from GET /api/sessions on
   *  initSessions / refreshSessions. Drives SessionSwitcher dropdown's
   *  recency sort + "X 分钟前" meta. Undefined for tabs that came back
   *  without the field (older server / pre-write race). */
  lastActivityAt?: number;
}

/** UI label fallback for a tab whose server-side displayName is undefined.
 *  Single helper so all surfaces (TabStrip / SessionSwitcher / TopBar) render
 *  the same string and we never reintroduce a hardcoded "default" anywhere. */
export function tabLabel(tab: Pick<ChatTab, 'sid' | 'displayName'>): string {
  const n = tab.displayName?.trim();
  return n && n.length > 0 ? n : `session ${tab.sid.slice(0, 6)}`;
}

interface AppState {
  // ── UI mode ──
  mode: AppMode;
  setMode: (m: AppMode) => void;

  // P2.6a — widened from a closed union to `string` because the Sidebar TOOLS
  // row now mixes built-in tabs (`agents`/`files`) with bus-sourced workbench
  // plugin ids (e.g. `wb:character`, `wb:skill`). The set is open and grows
  // as new wb-* manifests land in packages/marketplace/plugins/.
  workbenchTab: string;
  setWorkbenchTab: (t: string) => void;

  // 2026-05-21 — When a workbench plugin opts into MainArea takeover (its
  // panel is bigger than what fits in the Sidebar — iframe-embedded editors
  // like wb-character), tile click sets this slot instead of workbenchTab.
  // MainArea/WorkbenchMode.tsx early-returns a full-bleed plugin host when
  // this is non-null; null = show the default workbench gallery / editor.
  workbenchExpandedPluginId: string | null;
  setWorkbenchExpandedPluginId: (id: string | null) => void;

  // 2026-06 (architecture review §B3) — workbenchTab (sidebar nav) and
  // workbenchExpandedPluginId (center takeover) used to be set by separate
  // calls on every "open a plugin" path; missing one desynced the sidebar
  // left pane from the center (the left-pane-blank class of bug). openWorkbench
  // is the ONE atomic action every open path funnels through, so the two fields
  // can never drift. (The low-level setters above remain only for the center
  // "返回工作台" collapse, which clears expandedPluginId while keeping the tab.)
  //   tab               — sidebar tab to activate ('agents' | 'files' | 'wb:<id>')
  //   expandedPluginId  — plugin to expand into the center, or null (none).
  //                       Omit to leave the current center plugin untouched.
  openWorkbench: (opts: { tab?: string; expandedPluginId?: string | null }) => void;

  // ── Windowing (detached OS windows) ──
  // Set of surface keys (see lib/platform/surface.ts `surfaceKey`) currently
  // hosted in their own OS window instead of the main window's keep-alive
  // layer. A surface is either `docked` (absent here, hosted in-window via
  // keep-alive) or `floating` (present here, hosted in a Tauri WebviewWindow).
  // While floating, the main window MUST NOT also render its keep-alive iframe
  // (that would spin up a second 3D engine / WS for the same surface), so
  // KeepAlivePluginIframes filters these out.
  //
  // Browser form: detach is a no-op (WindowManager.canDetach() === false), so
  // this map stays empty and behavior is unchanged.
  floatingSurfaces: Record<string, true>;
  detachSurface: (d: SurfaceDescriptor, opts?: { title?: string }) => Promise<void>;
  redockSurface: (d: SurfaceDescriptor) => Promise<void>;
  /** Plugin IDs currently open as top-level DockShell panels (so Sidebar knows
   *  to hide their keep-alive iframes to avoid double-rendering). */
  dockedPlugins: Set<string>;
  addDockedPlugin: (id: string) => void;
  removeDockedPlugin: (id: string) => void;
  /** Internal: called by the WindowManager close listener (see main.tsx) when
   *  the user closes a detached window — redocks without re-closing the window. */
  markSurfaceDocked: (key: string) => void;

  // P2.7f — cross-component deep link from a Sidebar wb-* placeholder's "在
  // Bus 详情查看 →" button into the BusAdminPanel: set the plugin id here +
  // setMode('bus'), and BusAdminPanel reads/clears this on mount or whenever
  // it changes, auto-expanding that row and scrolling it into view. Null when
  // no pending request.
  pendingBusExpandId: string | null;
  setPendingBusExpandId: (id: string | null) => void;

  // Composer 的 "右键 → 在对话中引用" 跨组件插入桥已迁出到 lib/composer-bridge.ts
  // (requestComposerInsert / useComposerPendingInsert),不再寄居在 useAppStore。
  // checkpoint 回退 / WAL replay / chat 消息流都已迁到 chat app 的 session store。

  // P3.33 — reverse deep-link target from BusAdminPanel agent detail row's
  // "← 在 Sidebar 高亮" button into the Sidebar AgentsPanel. We store the bus
  // pluginId (the same key BusAdminPanel rows use) rather than the AgentRec.id,
  // because the AgentsPanel already knows the pluginId ⇄ agent id mapping via
  // agents_from_bus[].pluginId. AgentsPanel reads/clears this on flip,
  // scrolling the matching card into view and flashing it for ~1.5s. Null when
  // no pending request. Symmetric mate to pendingBusExpandId (P2.7f) — together
  // they wire Sidebar ⇄ Bus admin two-way navigation.
  pendingSidebarFocusPluginId: string | null;
  setPendingSidebarFocusPluginId: (id: string | null) => void;

  // P3.37 — deep-link target from Sidebar BUS KINDS footer 6-chip into the
  // BusAdminPanel kind filter. setMode('bus') + setPendingBusKindFilter('agent')
  // → BusAdminPanel reads this on mount/change and solos that kind (sets its
  // local enabledKinds = new Set([kind])), then clears the slot. Symmetric to
  // pendingBusExpandId (P2.7f, row expand) — both gate BusAdminPanel initial
  // view from a remote surface, but operate on different axes (kind filter vs
  // single row expand). Null when no pending request.
  pendingBusKindFilter: string | null;
  setPendingBusKindFilter: (kind: string | null) => void;

  // P3.38 — reverse mate to pendingBusKindFilter (P3.37). When the player
  // clicks a kind chip inside BusAdminPanel's filter row, we set this slot to
  // that kind; the Sidebar BUS KINDS footer reads it once, flashes the matching
  // .ss-kind-chip for ~1.5s (pulse + glow), then clears it. Confirms in the
  // peripheral surface "this kind is where you just acted" — same loop as
  // P3.33 (pendingSidebarFocusPluginId) but on the kind axis instead of agent
  // pluginId axis.
  pendingSidebarKindFlash: string | null;
  setPendingSidebarKindFlash: (kind: string | null) => void;

  // P3.40 — sibling to pendingSidebarKindFlash, but the receiving surface is
  // the ChatPanel TabStrip's .ts-bus-chip (the bus host count chip on the
  // right side of the screen). Triggered every time the player toggles a
  // plugin row in BusAdminPanel — we set this to the row's pluginId, TabStrip
  // pulses its bus-chip for ~0.8s (green peripheral confirmation), then clears.
  // 9th deep-link surface; first time a single-instance chip (not a per-kind
  // chip) takes a reverse flash signal, so we use a tick-bound string slot
  // instead of a kind selector. Value is informational only (TabStrip doesn't
  // read it for branching, just trigger detection).
  pendingChatPanelBusFlash: string | null;
  setPendingChatPanelBusFlash: (id: string | null) => void;

  // P3.70 — deep-link target from Analytics 7-day Run trend bars into the
  // Dashboard Runs sub-page. Bar click sets this to the day's UTC-local start
  // ms + label (e.g. {dayStartMs, dayLabel:"5-16"}); RunsList consumes it once
  // on mount/change, copies into a local dateFilter state, then clears the
  // slot. Filters the runs table to that single calendar day. 14th
  // expand-pipeline surface — first time a non-bus deep-link target lands
  // (target is sibling Dashboard sub-page, not BusAdminPanel).
  pendingRunsDateFilter: { dayStartMs: number; dayLabel: string } | null;
  setPendingRunsDateFilter: (f: { dayStartMs: number; dayLabel: string } | null) => void;

  activeSession: string;
  setActiveSession: (s: string) => void;

  /** Pin an agent to a tab (key = sid). The single mutator for tab↔agent
   *  binding; every history-replay / live-routing / UI-highlight derives from
   *  `tabs.find(t => t.sid === activeSid)?.agentId`.
   *
   *  Side effect: also writes into `agentBySid[sid]` so the next time anyone
   *  navigates to that sid (tab switch / session pick / boot restore) we
   *  restore this exact agent, parity with ref ink-renderer
   *  `dataSource.writeCachedAgent(instanceId, agent)`. */
  setTabAgent: (sid: string, agentId: string | null) => void;

  /** Per-sid agentPath cache, mirror of ref's `agentByInstance` (renderer-cache-store).
   *  Restored on boot from localStorage so switching back to a session
   *  re-selects the agent the user last chose for that session, instead of
   *  defaulting to root (or worse — leaking the previous session's pick). */
  agentBySid: Record<string, string>;
  /** Read cache w/ guarded null fallback. */
  getCachedAgentForSid: (sid: string | null) => string | null;

  // ── Workbench file preview (multi-tab) ──
  // `kind` drives the renderer in WorkbenchMode:
  //   text  → textarea (editable, savable)
  //   image → <img src=/api/files/raw?path=...>
  //   audio → <audio controls>
  //   video → <video controls>
  //   model → <model-viewer> (lazy)
  //   binary → unsupported notice + size
  // `content` is only present for kind==='text' (server skips decode for
  // binary kinds since 2026-05-17 — was producing PNG-as-mojibake before).
  openFiles: PreviewFile[];
  activeFilePath: string | null;
  openFile: (path: string) => Promise<void>;
  /** Inject a file descriptor directly without hitting /api/files (devtools / tests). */
  openFileDirect: (file: PreviewFile) => void;
  /** Switch focus to an already-open tab. No-op if path not in openFiles. */
  activateFile: (path: string) => void;
  /** Close a specific tab by path, or the active tab if path is omitted. */
  closeFile: (path?: string) => void;
  updatePreviewContent: (content: string) => void;
  savePreviewFile: () => Promise<{ ok: boolean; error?: string }>;

  // ── Pinned active game (user's explicit selection; null = auto-detect) ──
  pinnedSlug: string | null;
  setPinnedSlug: (s: string | null) => void;

  // ── Current chat session id (bug #2 fix). null = let server auto-generate
  //    a fresh `sess-<timestamp>` for the next message. Set when we receive
  //    agent-start (echoed by server) or via the SessionSwitcher / NewMenu.
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;

  /** Per-(sid, agentId) streaming/busy flag, mirrored from the chat app so L1
   *  registry surfaces (SessionSwitcher / AgentsPanel) can render a spinner
   *  without importing chat message state. Owned by chat via setAgentBusy. */
  busyByAgentBySid: Record<string, Record<string, boolean>>;
  setAgentBusy: (sid: string, agentId: string, busy: boolean) => void;

  // ── Console buffer from engine iframe (VAG_CONSOLE postMessage) ──
  consoleLog: ConsoleEntry[];
  pushConsole: (entry: ConsoleEntry) => void;
  clearConsole: () => void;

  // ── Network buffer from engine iframe (VAG_NETWORK postMessage) ──
  networkLog: NetworkEntry[];
  pushNetwork: (entry: NetworkEntry) => void;
  clearNetwork: () => void;

  // ── Telemetry buffer (trace spans + structured logs) ──
  //  Fed by two信道 into ONE slice: node telemetry over WS
  //  (`{type:'telemetry'}`, handleDaemonWs) and iframe telemetry over
  //  postMessage (`{type:'VAG_TELEMETRY'}`, healthBridge). Span + log records
  //  live together (split by `kind` in the viewer). Capped at 500 (S4).
  telemetry: TelemetryRecord[];
  pushTelemetry: (records: TelemetryRecord[]) => void;
  clearTelemetry: () => void;

  // ── Persistent cli provider override (composer cli-selector) ──
  /** When set, every chat turn is routed via this CliProvider id regardless of
   *  the agent's manifest-declared provider. Stays until user explicitly
   *  switches back to 'forgeax' (null) via the dropdown —— null 即 R3 之后的
   *  默认原生路径（POST /api/sessions/:sid/messages 直发 EventBus）。 */
  providerOverride: string | null;
  setProviderOverride: (id: string | null) => void;

  // ── Agent install/uninstall preferences ──
  /** Ids of agents the user has explicitly «卸载» from Settings → Agents.
   *  Default empty (= every agent listed by /api/workbench/agents is
   *  considered installed). ChatAgentStrip subtracts this set; main-agent
   *  delegate tool surface (server side) reads the parallel prefs file. */
  uninstalledAgentIds: string[];
  /** Toggle membership for a single agent id. Persists to localStorage and
   *  best-effort POSTs to `/api/prefs/uninstalled-agents` so server tools
   *  see the same view (see prefs router). */
  toggleAgentInstalled: (id: string) => void;
  /** Set membership explicitly. Same persistence as toggle. */
  setAgentInstalled: (id: string, installed: boolean) => void;
  /** Agent id to bootstrap when the user creates a new session. null = use
   *  server default (currently 'root'). When set to a marketplace persona id
   *  (mochi/iori/suzu/rin/…), server resolves persona and scaffolds with
   *  personaFile pre-filled (same auto-scaffold logic as POST /messages). */
  defaultBootstrapAgent: string | null;
  setDefaultBootstrapAgent: (id: string | null) => void;

  // ── Live agent state (driven by WS events + list_agents poll) ──
  liveAgents: Record<string, LiveAgent[]>;
  agentFileActivity: Record<string, Record<string, AgentFileTouch[]>>;
  setLiveAgents: (sid: string, agents: LiveAgent[]) => void;
  pushFileTouch: (sid: string, agentPath: string, touch: AgentFileTouch) => void;
  updateFileTouchStatus: (sid: string, agentPath: string, callId: string, status: 'done' | 'error') => void;

  // ── Sessions（= tabs，2026-05-20 重做后是同一个东西）──
  /** All open sessions, rendered as chat tabs. Strictly derived from server
   *  `GET /api/sessions`. boot 调用 initSessions 拉 list / 必要时建一条；之后
   *  的 CRUD（新建 / 删除 / 切换 / pin agent）都通过 store actions，store 是
   *  唯一真值源 —— 没有"无 sid 的 scratch tab"，没有"session 没了 tab 还在"。 */
  tabs: ChatTab[];
  /** 当前活跃的 sid。tabs 至少有一个时，必落在 tabs.map(t=>t.sid) 里。
   *  null 仅在 boot 中间态 / server 端 sessions 真为空 + auto-create 失败时出现。 */
  activeSid: string | null;
  /** boot-time 初始化：拉 GET /api/sessions → 列表非空就用 [activeSid 或 [0]]；
   *  列表为空就 POST /api/sessions { autoStart: true } 建一条（不传 displayName /
   *  defaultDir，让 server 端缺省决定）。完成后调 connectForgeaXWs 把 WS 连上
   *  active sid。可重入 —— 多次调只跑一次（_initSessionsPending 内部 dedupe）。 */
  initSessions: () => Promise<void>;
  /** 新建 session = POST /api/sessions → push 进 tabs → 切过去。`displayName` 不
   *  传时让 server 端落 undefined（UI 走 tabLabel 占位规则）。失败返回 null。 */
  createNewSession: (opts?: {
    displayName?: string;
    defaultDir?: string;
    providerOverride?: string | null;
  }) => Promise<{ sid: string } | null>;
  /** 切到指定 sid。tab 必须已存在（不存在就先 refreshSessions 拉一下）。
   *  内部触发：mirror 切换 / WS 重连 / persist activeSid / agentBySid 缓存恢复。 */
  switchToSession: (sid: string) => Promise<void>;
  /** 关闭并删除 session。abort in-flight stream → DELETE /api/sessions/:sid →
   *  remove from tabs → 切到剩余的第一条；空了就再 createSession 建一条新的
   *  （保证总有一个 active session 可用）。 */
  closeSession: (sid: string) => Promise<void>;
  /** 重新拉一遍 server sessions 列表，merge 进 tabs（保留本地 messages / 各 tab
   *  in-flight 状态）。手动刷新 / 切换后兜底用。 */
  refreshSessions: () => Promise<void>;
  /** 切换当前 game（GameSwitcher.onPick 与新建 game 共用）：pin → 设为 server active
   *  game（使新建 session 绑对）→ 按该 game 收口刷新 session 列表 → 落到最近活跃的一条；
   *  该 game 0 条 session 时自动新建一条（"新建 game 必带 session"）。 */
  switchGame: (slug: string) => Promise<void>;
  renameTab: (sid: string, displayName: string) => void;
  /** L3 sub-agent switcher (P6d step d). For tabs with a server-side thread,
   *  PATCH /api/threads/:id { activeEmitterId } so the next /api/chat turn
   *  in this tab gets routed to the picked emitter. Side-effect-only — no
   *  immediate UI change beyond a status indication. */
  setActiveEmitter: (emitterId: string) => Promise<void>;

  // ── Dashboard overlay ──
  dashboardOpen: boolean;
  setDashboardOpen: (open: boolean) => void;

  /** Settings panel overlay (replaces the old TopBar Bus mode tab + the
   *  right-slide SettingsDrawer).  Sections live in a registry filled by
   *  any number of `useSettingsSection({...})` callers (Plugins/Keys/
   *  Models/CliProviders/Workspace/Account/About …).  `settingsSection`
   *  is the currently-selected nav id; null lets the panel default to
   *  the highest-priority section on open. */
  settingsOpen: boolean;
  settingsSection: string | null;
  setSettingsOpen: (open: boolean) => void;
  setSettingsSection: (id: string | null) => void;
  /** Convenience — open the panel AND jump to a specific section in one
   *  call.  Every former `setMode('bus')` deep-link uses
   *  `openSettings('plugins')` (with optional pendingBus* slot prep). */
  openSettings: (section?: string) => void;

  // ── Fullscreen ("immersive" mode) ──
  //
  // Hides TopBar / Sidebar / ChatPanel / StatusBar so MainArea fills the
  // viewport. Toggled via Ctrl+Shift+F (see lib/global-shortcuts.ts) or
  // the Settings → Shortcuts section. Esc also exits.
  fullscreen: boolean;
  setFullscreen: (v: boolean) => void;
  toggleFullscreen: () => void;

  // ── Sidebar / ChatPanel collapse (kept separate from width drag) ──
  //
  // Toggled via Ctrl+Shift+B / Ctrl+Shift+C. The actual width is owned by
  // useLocalSize hooks in App.tsx — these flags layer on top and hide the
  // pane via CSS without losing the drag-restored width.
  sidebarCollapsed: boolean;
  chatpanelCollapsed: boolean;
  toggleSidebar: () => void;
  toggleChatpanel: () => void;
}

// rendererToolCallToLegacy moved to lib/event-engine/message-builder.ts —
// it is shared by live and replay paths so its home is colocated with the
// callback factories that use it (P6).

// turnsToChatMessages removed — replay no longer goes through batch
// onTurn/CompletedTurn flatten. Both live and replay now feed events into
// TurnAccumulator in arrival order; the callbacks (buildMain/SubCallbacks)
// mutate the ChatMessage model through MessageEffects (live: store; replay:
// in-memory). This is the only way `tc.at` placement matches live, because
// onMessage(tool_call) sees the same m.text.length snapshot in both paths.


// localStorage key for the persistent cli provider override. Picking 'claude-code'
// should survive a page reload — matches the "pick once, keep using it" feedback.
const PROVIDER_OVERRIDE_KEY = 'forgeax.providerOverride';
function loadProviderOverride(): string | null {
  try {
    const v = localStorage.getItem(PROVIDER_OVERRIDE_KEY);
    return v && v !== 'null' ? v : null;
  } catch {
    return null;
  }
}
function saveProviderOverride(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(PROVIDER_OVERRIDE_KEY);
    else localStorage.setItem(PROVIDER_OVERRIDE_KEY, id);
  } catch { /* ignore (private mode / SSR) */ }
}

// Cross-tab sync: when a sibling tab writes to PROVIDER_OVERRIDE_KEY, push
// the new value into our zustand state so the cli-selector button rerenders
// without a manual reload. Without this, two open tabs drift — tab A shows
// 'auto' even though localStorage already says 'claude-code' (tick 224 hunt).
// The 'storage' event only fires for sibling tabs, not the writer tab; that
// path uses setProviderOverride directly.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== PROVIDER_OVERRIDE_KEY) return;
    const next = e.newValue && e.newValue !== 'null' ? e.newValue : null;
    if (useAppStore.getState().providerOverride !== next) {
      useAppStore.setState({ providerOverride: next });
    }
  });
}

// 用户「卸载」掉的 agent id 列表 —— 首次启动 (INITIALIZED_KEY 缺) 由
// `seedUninstalledIfFirstRun` 把所有 agent 减去 DEFAULT_INSTALLED_AGENT_IDS
// 写进来，之后用户在 Settings → Agents 里勾掉/勾上 都更新这个 list 跟服务端
// 镜像 ~/.forgeax/prefs/uninstalled-agents.json 同步。ChatAgentStrip 渲染时
// 用这个集合做减法过滤；server 端 delegate-tool 同样读这份。
//
// 默认安装五个：forge (main, 不可卸载) + mochi + iori + suzu + rin
//   —— 覆盖 orchestrator + 4 个最常用 sub-persona，剩下的 plugin agent 全部
//   默认卸载，保持 ChatAgentStrip 简洁。用户想要更多，去 Settings → Agents 勾。
//   想换默认 5 个，改这个常量即可（已用过 INITIALIZED_KEY 的老用户不受影响 ——
//   他们的偏好是已生效的本地状态，不会被新默认覆盖）。
export const DEFAULT_INSTALLED_AGENT_IDS = ['forge', 'mochi', 'iori', 'suzu', 'rin'];

const UNINSTALLED_AGENTS_KEY = 'forgeax.uninstalledAgents';
const UNINSTALLED_AGENTS_INITIALIZED_KEY = 'forgeax.uninstalledAgents.initialized';
const DEFAULT_BOOTSTRAP_AGENT_KEY = 'forgeax.defaultBootstrapAgent';
const SETTINGS_SECTION_KEY = 'forgeax.settingsSection';

function loadSettingsSection(): string | null {
  try {
    const v = localStorage.getItem(SETTINGS_SECTION_KEY);
    return v && v.trim() ? v : null;
  } catch { return null; }
}
function saveSettingsSection(id: string | null): void {
  try {
    if (id) localStorage.setItem(SETTINGS_SECTION_KEY, id);
    else localStorage.removeItem(SETTINGS_SECTION_KEY);
  } catch { /* ignore */ }
}

function loadDefaultBootstrapAgent(): string | null {
  try {
    const v = localStorage.getItem(DEFAULT_BOOTSTRAP_AGENT_KEY);
    return v && v.trim() ? v : null;
  } catch { return null; }
}
function saveDefaultBootstrapAgent(id: string | null): void {
  try {
    if (id) localStorage.setItem(DEFAULT_BOOTSTRAP_AGENT_KEY, id);
    else localStorage.removeItem(DEFAULT_BOOTSTRAP_AGENT_KEY);
  } catch { /* ignore */ }
}
function loadUninstalledAgentIds(): string[] {
  try {
    const raw = localStorage.getItem(UNINSTALLED_AGENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {
    return [];
  }
}
function saveUninstalledAgentIds(ids: string[]): void {
  try {
    if (ids.length === 0) localStorage.removeItem(UNINSTALLED_AGENTS_KEY);
    else localStorage.setItem(UNINSTALLED_AGENTS_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
}
async function pushUninstalledAgentsToServer(ids: string[]): Promise<void> {
  try {
    await fetch('/api/prefs/uninstalled-agents', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch { /* server prefs are advisory — mirror, never SSOT */ }
}

/** First-run seed: when INITIALIZED_KEY is absent, treat the prefs file as
 *  fresh. Call with the full agent id list (from /api/workbench/agents) ——
 *  uninstall everything that's not in DEFAULT_INSTALLED_AGENT_IDS. Idempotent:
 *  subsequent calls hit the localStorage flag and short-circuit. Skips main
 *  agent (`isMain`) since it's never uninstallable anyway.
 *
 *  Both ChatAgentStrip and AgentsBody fetch /api/workbench/agents; whichever
 *  fires first runs the seed. Setting flag *before* save() prevents a second
 *  caller racing in mid-write.
 */
export function seedUninstalledIfFirstRun(allIds: string[], mainId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(UNINSTALLED_AGENTS_INITIALIZED_KEY)) return;
  } catch { return; }
  const installable = new Set(DEFAULT_INSTALLED_AGENT_IDS);
  if (mainId) installable.add(mainId);
  const uninstalled = allIds
    .filter((id) => !installable.has(id))
    .sort();
  try { localStorage.setItem(UNINSTALLED_AGENTS_INITIALIZED_KEY, '1'); } catch { /* ignore */ }
  saveUninstalledAgentIds(uninstalled);
  void pushUninstalledAgentsToServer(uninstalled);
  useAppStore.setState({ uninstalledAgentIds: uninstalled });
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== UNINSTALLED_AGENTS_KEY) return;
    const next = loadUninstalledAgentIds();
    const cur = useAppStore.getState().uninstalledAgentIds;
    if (cur.length !== next.length || cur.some((id, i) => id !== next[i])) {
      useAppStore.setState({ uninstalledAgentIds: next });
    }
  });
}


// Single global WS connection for daemon tick stream. Mounted lazily on first
// store creation. Reconnects with exponential backoff.
let _wsForDaemons: WebSocket | null = null;
let _wsRetryMs = 1000;
function connectDaemonWs(onMessage: (msg: unknown) => void): void {
  if (typeof window === 'undefined') return;
  if (_wsForDaemons && _wsForDaemons.readyState !== WebSocket.CLOSED) return;
  try {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    _wsForDaemons = ws;
    ws.onopen = () => {
      _wsRetryMs = 1000;
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(typeof e.data === 'string' ? e.data : ''));
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      _wsForDaemons = null;
      setTimeout(() => connectDaemonWs(onMessage), _wsRetryMs);
      _wsRetryMs = Math.min(_wsRetryMs * 2, 30000);
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* ignore */ }
    };
  } catch {
    setTimeout(() => connectDaemonWs(onMessage), _wsRetryMs);
  }
}

// ── Sessions persistence ───────────────────────────────────────────────────
// 2026-05-20 重做：不再持久化 tabs 数组本身（tabs = GET /api/sessions 派生）。
// 只持久化 activeSid（用户上次看的是哪条），boot 时再 init。同时一次性清掉
// 老 key (forgeax.tabs / forgeax.activeTabId) 防止旧数据残留。
const ACTIVE_SID_KEY = 'forgeax.activeSid';
const AGENT_BY_SID_KEY = 'forgeax.agentBySid';
// 老 keys —— 启动时一次性 cleanup 清掉，老用户回来不会带着无效"幽灵 tab" 启动。
const LEGACY_TABS_KEY = 'forgeax.tabs';
const LEGACY_ACTIVE_TAB_KEY = 'forgeax.activeTabId';

(function cleanupLegacyKeys(): void {
  try {
    localStorage.removeItem(LEGACY_TABS_KEY);
    localStorage.removeItem(LEGACY_ACTIVE_TAB_KEY);
  } catch { /* ignore (private mode / SSR) */ }
})();

/** Persisted per-sid agent cache —— ref ink-renderer `agentByInstance` 移植。
 *  对外只暴露 read / write 两个动作；boot 时一次性 load 当 init state，runtime
 *  写盘交给 `setTabAgent` 的副作用。 */
function loadAgentBySid(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AGENT_BY_SID_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [sid, agent] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof sid === 'string' && typeof agent === 'string' && sid && agent) {
        out[sid] = agent;
      }
    }
    return out;
  } catch {
    return {};
  }
}
function persistAgentBySid(map: Record<string, string>): void {
  try { localStorage.setItem(AGENT_BY_SID_KEY, JSON.stringify(map)); }
  catch { /* ignore */ }
}

function loadActiveSid(): string | null {
  try {
    const v = localStorage.getItem(ACTIVE_SID_KEY);
    return v && v.trim() ? v : null;
  } catch { return null; }
}
function persistActiveSid(sid: string | null): void {
  try {
    if (sid) localStorage.setItem(ACTIVE_SID_KEY, sid);
    else localStorage.removeItem(ACTIVE_SID_KEY);
  } catch { /* ignore */ }
}

/** Patch a session tab's registry field (key = sid). Mirrors providerOverride
 *  to the top-level default when the patched tab is active. Chat message state
 *  no longer lives on the tab — it's owned by the chat app's session store. */
function patchTabField(
  state: AppState,
  sid: string,
  patch: Partial<Pick<ChatTab, 'providerOverride' | 'displayName'>>,
): Partial<AppState> {
  const tabs = state.tabs.map((t) => (t.sid === sid ? { ...t, ...patch } : t));
  const out: Partial<AppState> = { tabs };
  if (state.activeSid === sid && patch.providerOverride !== undefined) {
    out.providerOverride = patch.providerOverride;
  }
  return out;
}

/** initSessions in-flight dedupe —— React StrictMode 双 mount / HMR 重载时 effect
 *  会跑两次，避免对 server 发两次重复 POST。promise 完成后清回 null，下次有需要
 *  可重新初始化（手动 reset 等）。 */
let _initSessionsPending: Promise<void> | null = null;

/** Pull active agent's running 真值并同步到 tab.isStreaming —— 解决"前端 ws 连上
 *  时后端 agent 早就在跑（错过 turnStart）→ UI 仍以为 idle"这种臆想态。
 *
 *  调用时机：boot / refresh / 切 active session / 新建 session / 关闭兜底新建 ——
 *  即每次 `connectForgeaXWs(sid)` 的紧后面。增量靠 hook:turnStart/turnEnd 事件，
 *  这里只补"WS 连上一刻的快照"。
 *
 *  失败 / sid null 静默 —— 网络/server 抖动时 UI 维持上一份状态，下次切换再拉。 */
async function _syncActiveAgentRunning(sid: string | null): Promise<void> {
  if (!sid) return;
  try {
    const { listSessionAgents } = await import('./lib/forgeax-bridge');
    const agents = await listSessionAgents(sid);
    if (agents.length === 0) return;
    // tab.agentId 还没绑（cached === null）→ 用 depth=1 root 兜底。
    //
    // 已绑但 cached id 不在 list_agents 里（典型场景：用户刚点了 mochi/iro
    // 这种 marketplace persona，server 端还没收到首条消息触发自动 scaffold，
    // session.tree 暂时见不到该 agent）—— **保留** 用户的 pin，不要 kick 回 root。
    // 这条规则与 AgentSwitcher 的 auto-pin 逻辑（line 202-208）保持一致：pin
    // 是 user intent，list_agents 没观察到 ≠ 该 pin 无效。早先这里强制重指 root
    // 正是用户报的「点击 mochi 头像但 forge/root 接管对话」bug 的源头之一。
    const root = agents.find((a) => a.depth === 1)?.path ?? agents[0]!.path;
    const tab = useAppStore.getState().tabs.find((t) => t.sid === sid);
    const cached = tab?.agentId ?? null;
    const cachedInTree = cached ? agents.some((a) => a.path === cached) : false;
    const wantPath = cached ? cached : root;
    const target = agents.find((a) => a.path === wantPath);
    // Marketplace pin not yet observed in tree (cached but not in agents):
    // wantPath === cached but `target` is undefined. We still want to keep
    // the pin and show running:false until the auto-scaffold lands. No
    // tab.messagesByAgent rewiring needed since the pin is unchanged.
    useAppStore.setState((s) => {
      // Only update agentBySid when we're filling a previously-empty slot.
      // Keeping a marketplace pin: cached !== null already => leave as-is.
      const agentBySid = cached ? s.agentBySid : { ...s.agentBySid, [sid]: wantPath };
      const tabs = s.tabs.map((t) => (t.sid === sid ? { ...t, agentId: wantPath } : t));
      return { tabs, agentBySid };
    });
    if (!cached) persistAgentBySid(useAppStore.getState().agentBySid);
  } catch (e) {
    console.warn('[syncActiveAgentRunning] failed', (e as Error).message);
  }
}

// Initial top-level mirror at module load. boot 时 tabs 是空的、activeSid 来自
// localStorage 但还没验证（initSessions 跑完才知道这个 sid 还在不在）。React
// 启动后第一次 effect 调 initSessions() 拉 server / 必要时 createSession，
// 然后 set tabs + activeSid，UI 才真亮起来（ChatPanel 在 tabs 为空时渲染空态/
// loading）。
const _initialActiveSid = loadActiveSid();
const _initialMirror = {
  tabs: [] as ChatTab[],
  activeSid: _initialActiveSid,
  currentSessionId: _initialActiveSid,
  providerOverride: loadProviderOverride(),
  uninstalledAgentIds: loadUninstalledAgentIds(),
  defaultBootstrapAgent: loadDefaultBootstrapAgent(),
};

// P-UNIFY.4 — daemon WS handler. Hoisted out of the store factory so it
// captures set/get via closure after they're available. Routes daemon-tick-*
// events to the right tab by threadId, with bubble keyed by tickId.
export function handleDaemonWs(msg: unknown): void {
  if (!msg || typeof msg !== 'object') return;
  const m = msg as { type?: string; threadId?: string; tickId?: string; daemonId?: string; event?: unknown; promptPreview?: string; bytes?: number; records?: unknown };
  // Telemetry (trace+log) main信道: node sidecar → server → WS
  // `{ type:'telemetry', records: Array<SpanData|LogRecord> }`. No threadId, so
  // it must be dispatched before the threadId guard below (same as
  // workspace-changed). Feeds the unified telemetry slice (500-cap, S4).
  if (m.type === 'telemetry') {
    const records = Array.isArray(m.records) ? (m.records as TelemetryRecord[]) : [];
    if (records.length) useAppStore.getState().pushTelemetry(records);
    return;
  }
  // Workspace hot-switch: the server re-pointed FORGEAX_PROJECT_ROOT at a new
  // dir. In-process and in-tab state scoped to the old root isn't re-scoped, so
  // every open tab must do a full reload (all per-request endpoints then re-read
  // the new root). This broadcast carries no threadId, so it must be handled
  // before the threadId guard below. Guard against reload loops: only reload
  // when the broadcast actually names a different active root than this tab's.
  if (m.type === 'workspace-changed') {
    try {
      const next = (m as { absPath?: string }).absPath ?? '';
      const prev = sessionStorage.getItem('forgeax.activeRoot') ?? '';
      if (next && next === prev) return;
      if (next) sessionStorage.setItem('forgeax.activeRoot', next);
      window.location.reload();
    } catch { /* non-browser ctx */ }
    return;
  }
  // daemon-tick-* events are chat-message concerns and are handled by the chat
  // app's own daemon-tick subscriber (packages/chat). L1 only routes the
  // app-agnostic telemetry + workspace-changed broadcasts above.
}

// Connect WS on module load. HMR-safe via globalThis flag so re-evaluated
// modules don't skip the connect or spawn duplicates.
const _DAEMON_WS_FLAG = '__FORGEAX_DAEMON_WS_BOUND__';
type WithFlag = { [_DAEMON_WS_FLAG]?: { handler: typeof handleDaemonWs } };
const _gt = globalThis as unknown as WithFlag;
if (typeof window !== 'undefined') {
  if (_gt[_DAEMON_WS_FLAG]) {
    // Update the live handler so HMR-refreshed code runs without
    // dropping the open socket connection.
    _gt[_DAEMON_WS_FLAG].handler = handleDaemonWs;
  } else {
    _gt[_DAEMON_WS_FLAG] = { handler: handleDaemonWs };
    connectDaemonWs((msg) => _gt[_DAEMON_WS_FLAG]!.handler(msg));
  }
}


export const useAppStore = create<AppState>((set, get) => ({
  // 启动 mode 跟随持久化的活动工作区（Play/Edit/AI），避免刷新后 tab 高亮与主区域
  // 内容错位（见 lib/workspaces.ts bootAppMode 注释）。
  mode: bootAppMode(),
  setMode: (m) => set({ mode: m }),
  workbenchTab: 'agents',
  setWorkbenchTab: (t) => set({ workbenchTab: t }),
  workbenchExpandedPluginId: null,
  setWorkbenchExpandedPluginId: (id) => set({ workbenchExpandedPluginId: id }),
  openWorkbench: ({ tab, expandedPluginId }) => set((s) => ({
    mode: 'workbench',
    workbenchTab: tab ?? s.workbenchTab,
    // `undefined` = leave center untouched (e.g. pure tab nav); explicit null
    // clears it; a string expands that plugin. Open paths always pass it.
    workbenchExpandedPluginId: expandedPluginId !== undefined ? expandedPluginId : s.workbenchExpandedPluginId,
  })),

  dockedPlugins: new Set<string>(),
  addDockedPlugin: (id) => set((s) => ({ dockedPlugins: new Set([...s.dockedPlugins, id]) })),
  removeDockedPlugin: (id) => set((s) => { const next = new Set(s.dockedPlugins); next.delete(id); return { dockedPlugins: next }; }),

  floatingSurfaces: {},
  detachSurface: async (d, opts) => {
    const wm = getWindowManager();
    if (!wm.canDetach()) return; // browser form — no-op
    const key = surfaceKey(d);
    // Optimistically mark floating so the main window tears down its keep-alive
    // iframe BEFORE the new window boots — avoids a transient double instance.
    set((s) => ({ floatingSurfaces: { ...s.floatingSurfaces, [key]: true } }));
    const ok = await wm.openSurfaceWindow(d, { title: opts?.title });
    if (!ok) {
      // Window failed to open — revert so the surface stays docked & visible.
      set((s) => {
        const next = { ...s.floatingSurfaces };
        delete next[key];
        return { floatingSurfaces: next };
      });
    }
  },
  redockSurface: async (d) => {
    const wm = getWindowManager();
    await wm.closeSurfaceWindow(d);
    get().markSurfaceDocked(surfaceKey(d));
  },
  markSurfaceDocked: (key) =>
    set((s) => {
      if (!s.floatingSurfaces[key]) return {} as Partial<typeof s>;
      const next = { ...s.floatingSurfaces };
      delete next[key];
      return { floatingSurfaces: next };
    }),
  pendingBusExpandId: null,
  setPendingBusExpandId: (id) => set({ pendingBusExpandId: id }),


  pendingSidebarFocusPluginId: null,
  setPendingSidebarFocusPluginId: (id) => set({ pendingSidebarFocusPluginId: id }),
  pendingBusKindFilter: null,
  setPendingBusKindFilter: (kind) => set({ pendingBusKindFilter: kind }),
  pendingSidebarKindFlash: null,
  setPendingSidebarKindFlash: (kind) => set({ pendingSidebarKindFlash: kind }),
  pendingChatPanelBusFlash: null,
  setPendingChatPanelBusFlash: (id) => set({ pendingChatPanelBusFlash: id }),
  pendingRunsDateFilter: null,
  setPendingRunsDateFilter: (f) => set({ pendingRunsDateFilter: f }),
  activeSession: 'main-design',
  setActiveSession: (s) => set({ activeSession: s }),
  setTabAgent: (sid, agentId) => {
    set((s) => {
      const tabs = s.tabs.map((t) => (t.sid === sid ? { ...t, agentId } : t));
      // sid 总是有效（=tab 主键），直接写 agentBySid 缓存。agentId=null 时显式
      // delete 这个 key，保持 map 紧凑（避免 stale 残留）。
      const agentBySid = { ...s.agentBySid };
      if (agentId) agentBySid[sid] = agentId;
      else delete agentBySid[sid];
      persistAgentBySid(agentBySid);
      return { tabs, agentBySid };
    });
  },

  agentBySid: loadAgentBySid(),
  getCachedAgentForSid: (sid) => {
    if (!sid) return null;
    return get().agentBySid[sid] ?? null;
  },
  // providerOverride 设置：写盘当默认 + mirror 到 active tab。switchToSession 时
  // mirror 自动从新 tab 的 providerOverride 拉过去，这俩 setter 不需要 tab-aware。
  setProviderOverride: (id) => {
    saveProviderOverride(id);
    set((s) => {
      if (!s.activeSid) return { providerOverride: id };
      return { providerOverride: id, ...patchTabField(s, s.activeSid, { providerOverride: id }) };
    });
  },
  // Agent install/uninstall —— localStorage 是 SSOT，server 端 prefs 是 mirror。
  // 写本地立刻生效（ChatAgentStrip 重渲染），同时尽力 POST 到 /api/prefs，让
  // 主 agent 的 delegate 工具下一轮拉到的列表也是过滤后的。POST 失败不回滚 ——
  // 服务端 fallback 是「全量可见」，最差也只是工具看到一些用户不想要的 agent。
  toggleAgentInstalled: (id) => {
    if (!id) return;
    set((s) => {
      const cur = s.uninstalledAgentIds;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].sort();
      saveUninstalledAgentIds(next);
      void pushUninstalledAgentsToServer(next);
      return { uninstalledAgentIds: next };
    });
  },
  setAgentInstalled: (id, installed) => {
    if (!id) return;
    set((s) => {
      const cur = s.uninstalledAgentIds;
      const has = cur.includes(id);
      if (installed && !has) return {};
      if (!installed && has) return {};
      const next = installed
        ? cur.filter((x) => x !== id)
        : [...cur, id].sort();
      saveUninstalledAgentIds(next);
      void pushUninstalledAgentsToServer(next);
      return { uninstalledAgentIds: next };
    });
  },
  setDefaultBootstrapAgent: (id) => {
    saveDefaultBootstrapAgent(id);
    set({ defaultBootstrapAgent: id });
  },
  // currentSessionId 在重做后等价 activeSid（一一对应），setter 保留只是为了不
  // 破已有 import surface —— 但实际真正切 session 应该走 switchToSession()。这里
  // 只 mirror top-level 字段、不动 activeSid（防止误用导致状态机错乱）。
  setCurrentSessionId: (id) => {
    set({ currentSessionId: id });
  },

  busyByAgentBySid: {},
  setAgentBusy: (sid, agentId, busy) => set((s) => {
    if (!sid || !agentId) return {};
    const perSid = s.busyByAgentBySid[sid] ?? {};
    if (Boolean(perSid[agentId]) === busy) return {};
    const nextPerSid = { ...perSid };
    if (busy) nextPerSid[agentId] = true;
    else delete nextPerSid[agentId];
    return { busyByAgentBySid: { ...s.busyByAgentBySid, [sid]: nextPerSid } };
  }),



  consoleLog: [],
  pushConsole: (entry) => {
    recordLog('console', entry); // mirror to disk (.forgeax/logs/console.jsonl)
    set((s) => ({
      // Cap at 500 entries to bound memory; oldest drop off.
      consoleLog: s.consoleLog.length >= 500
        ? [...s.consoleLog.slice(s.consoleLog.length - 499), entry]
        : [...s.consoleLog, entry],
    }));
  },
  clearConsole: () => set({ consoleLog: [] }),

  networkLog: [],
  pushNetwork: (entry) => {
    recordLog('network', entry); // mirror to disk (.forgeax/logs/network.jsonl)
    set((s) => ({
      // Cap at 500 entries to bound memory; oldest drop off.
      networkLog: s.networkLog.length >= 500
        ? [...s.networkLog.slice(s.networkLog.length - 499), entry]
        : [...s.networkLog, entry],
    }));
  },
  clearNetwork: () => set({ networkLog: [] }),

  telemetry: [],
  pushTelemetry: (records) => {
    if (!records.length) return;
    set((s) => {
      const next = [...s.telemetry, ...records];
      // Cap at 500 records (S4); drop oldest.
      return { telemetry: next.length > 500 ? next.slice(next.length - 500) : next };
    });
  },
  clearTelemetry: () => set({ telemetry: [] }),

  liveAgents: {},
  agentFileActivity: {},
  setLiveAgents: (sid, agents) => set((s) => ({
    liveAgents: { ...s.liveAgents, [sid]: agents },
  })),
  pushFileTouch: (sid, agentPath, touch) => set((s) => {
    const perSid = s.agentFileActivity[sid] ?? {};
    const prev = perSid[agentPath] ?? [];
    const deduped = prev.filter((f) => f.path !== touch.path || f.callId === touch.callId);
    return {
      agentFileActivity: {
        ...s.agentFileActivity,
        [sid]: { ...perSid, [agentPath]: [...deduped, touch] },
      },
    };
  }),
  updateFileTouchStatus: (sid, agentPath, callId, status) => set((s) => {
    const perSid = s.agentFileActivity[sid];
    if (!perSid) return s;
    const prev = perSid[agentPath];
    if (!prev) return s;
    const next = prev.map((f) => (f.callId === callId ? { ...f, status } : f));
    return {
      agentFileActivity: {
        ...s.agentFileActivity,
        [sid]: { ...perSid, [agentPath]: next },
      },
    };
  }),

  pinnedSlug: (() => {
    try { return localStorage.getItem('forgeax.pinnedSlug') || null; } catch { return null; }
  })(),
  setPinnedSlug: (s) => {
    try { if (s) localStorage.setItem('forgeax.pinnedSlug', s); else localStorage.removeItem('forgeax.pinnedSlug'); } catch { /* ignore */ }
    set({ pinnedSlug: s });
  },

  openFiles: [],
  activeFilePath: null,

  openFile: async (path) => {
    // If already open, just activate it.
    if (get().openFiles.find((f) => f.path === path)) {
      set({ activeFilePath: path, mode: 'workbench', workbenchTab: 'files', workbenchExpandedPluginId: null });
      return;
    }
    const addFile = (file: PreviewFile) =>
      set((s) => ({
        openFiles: [...s.openFiles.filter((f) => f.path !== path), file],
        activeFilePath: path,
        mode: 'workbench',
        workbenchTab: 'files',
        workbenchExpandedPluginId: null,
      }));
    try {
      const r = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      if (!r.ok) {
        // Friendly, explanatory message instead of a raw "[error] 400 Bad Request".
        // The AGENTS file-activity ledger lists every file an agent *touched*,
        // including engine / library source it only READ — those live outside the
        // editable workspace (only .forgeax/games/** and packages/** are served),
        // so they 400. A 404 means the path no longer exists (moved/renamed/never
        // there — e.g. opening `index.ts` in a game whose entry is `main.ts`).
        let serverMsg = '';
        try { serverMsg = ((await r.json()) as { error?: string }).error ?? ''; } catch { /* non-JSON */ }
        const friendly = r.status === 400
          ? t('store.openFile.notInWorkspace', { path }) + (serverMsg ? t('store.openFile.serverDetail', { serverMsg }) : '')
          : r.status === 404
            ? t('store.openFile.notFound', { path })
            : t('store.openFile.failed', { path, status: r.status, statusText: r.statusText }) + (serverMsg ? ` — ${serverMsg}` : '');
        addFile({ path, kind: 'text', mime: 'text/plain', bytes: 0,
          content: friendly,
          error: serverMsg || `${r.status} ${r.statusText}` });
        return;
      }
      const j = (await r.json()) as {
        kind?: 'text' | 'image' | 'audio' | 'video' | 'model' | 'binary';
        mime?: string;
        size?: number;
        content?: string;
      };
      addFile({
        path,
        kind: j.kind ?? 'text',
        mime: j.mime ?? 'application/octet-stream',
        bytes: j.size ?? 0,
        content: j.kind === 'text' || !j.kind ? (j.content ?? '') : undefined,
      });
    } catch (e) {
      addFile({ path, kind: 'text', mime: 'text/plain', bytes: 0,
        content: `[error] ${(e as Error).message}`,
        error: (e as Error).message });
    }
  },

  openFileDirect: (file) => {
    set((s) => ({
      openFiles: [...s.openFiles.filter((f) => f.path !== file.path), file],
      activeFilePath: file.path,
      mode: 'workbench',
      workbenchTab: 'files',
      workbenchExpandedPluginId: null,
    }));
  },

  activateFile: (path) => {
    if (!get().openFiles.find((f) => f.path === path)) return;
    set({ activeFilePath: path });
  },

  closeFile: (path) => {
    set((s) => {
      const target = path ?? s.activeFilePath;
      if (!target) return {};
      const remaining = s.openFiles.filter((f) => f.path !== target);
      let nextActive = s.activeFilePath;
      if (s.activeFilePath === target) {
        // Pick the tab to the left, or the first remaining tab.
        const idx = s.openFiles.findIndex((f) => f.path === target);
        nextActive = remaining[Math.max(0, idx - 1)]?.path ?? remaining[0]?.path ?? null;
      }
      return { openFiles: remaining, activeFilePath: nextActive };
    });
  },

  updatePreviewContent: (content) => set((s) => {
    if (!s.activeFilePath) return {};
    const file = s.openFiles.find((f) => f.path === s.activeFilePath);
    if (!file || file.kind !== 'text') return {};
    return {
      openFiles: s.openFiles.map((f) =>
        f.path === s.activeFilePath ? { ...f, content, dirty: true } : f,
      ),
    };
  }),

  savePreviewFile: async () => {
    const { openFiles, activeFilePath } = get();
    const file = openFiles.find((f) => f.path === activeFilePath);
    if (!file) return { ok: false, error: 'no file open' };
    if (file.kind !== 'text') return { ok: false, error: 'binary files are read-only' };
    try {
      const r = await fetch('/api/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: file.path, content: file.content ?? '' }),
      });
      const j = (await r.json()) as { bytes?: number; error?: string };
      if (!r.ok) return { ok: false, error: j.error ?? `HTTP ${r.status}` };
      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.path === file.path ? { ...f, dirty: false, bytes: j.bytes ?? f.bytes } : f,
        ),
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  // ── Tab-aware messages/streaming state (P6 step 1) ──
  // The data lives in `tabs[active].messages` etc.; these top-level fields
  // are a *mirror* of the active tab for back-compat with components that
  // already do `useAppStore(s => s.messages)`. Initial values come from the
  // persisted-tabs loader so the first render sees the right tab content.
  //
  // Note: TS narrows spread types to optional; we re-state the literal fields
  // below so all required AppState slots are present at init time. The earlier
  // `providerOverride: null` / `currentSessionId: null` declarations are then
  // overridden by the spread.
  ..._initialMirror,


  initSessions: async () => {
    if (_initSessionsPending) return _initSessionsPending;
    _initSessionsPending = (async () => {
      const { fetchSessionList, createSession, connectForgeaXWs } = await import('./lib/forgeax-bridge');
      try {
        // 列表恒按当前 game 收口（pinnedSlug；null 时 server 回落 active game）。
        const scope = get().pinnedSlug ?? undefined;
        let metas = await fetchSessionList(scope);
        if (metas.length === 0) {
          // 真空态：兜底建一条。**不**传 displayName / defaultDir —— 让 server 端
          // 缺省决定，UI 走 tabLabel 占位规则反映"无名"真值，不再硬塞 default。
          const { sid } = await createSession({ autoStart: true });
          metas = await fetchSessionList(scope);
          // 兜底：如果 list 里居然没看到刚建的（应该不会，但 fs-watcher race 等
          // 极端情况），手动补一条 meta 进去保证 UI 有 tab。
          if (!metas.some((m) => m.sid === sid)) {
            metas = [{ sid }, ...metas];
          }
        }
        const newTabs: ChatTab[] = metas.map((m) => ({
          sid: m.sid,
          displayName: m.displayName,
          agentId: get().agentBySid[m.sid] ?? null,
          providerOverride: get().providerOverride,
          lastActivityAt: m.lastActivityAt,
        }));
        // localStorage 上次的 active sid 优先（如果还在 list 里），否则 tabs[0]。
        const persisted = loadActiveSid();
        const active = persisted && newTabs.some((t) => t.sid === persisted)
          ? persisted
          : (newTabs[0]?.sid ?? null);
        const activeTab = newTabs.find((t) => t.sid === active) ?? null;
        set({
          tabs: newTabs,
          activeSid: active,
          currentSessionId: active,
          providerOverride: activeTab?.providerOverride ?? get().providerOverride,
        });
        persistActiveSid(active);
        connectForgeaXWs(active);
        void _syncActiveAgentRunning(active);
      } catch (e) {
        console.error('[initSessions] failed', e);
        // boot 失败：UI 维持空 tabs，ChatPanel 渲染空态 + 让用户手点"重试 / 新建"。
        set({ tabs: [], activeSid: null });
      }
    })();
    try { await _initSessionsPending; } finally { _initSessionsPending = null; }
  },

  refreshSessions: async () => {
    const { fetchSessionList } = await import('./lib/forgeax-bridge');
    try {
      // 同 initSessions：按当前 game 收口（pinnedSlug；null → server 回落 active game）。
      const metas = await fetchSessionList(get().pinnedSlug ?? undefined);
      set((s) => {
        const byOldSid = new Map(s.tabs.map((t) => [t.sid, t] as const));
        const merged: ChatTab[] = metas.map((m) => {
          const existing = byOldSid.get(m.sid);
          if (existing) {
            // server 端 displayName / lastActivityAt 可能改了 —— 同步更新；
            // 其余 in-flight 状态保留。
            const stale = existing.displayName === m.displayName
              && existing.lastActivityAt === m.lastActivityAt;
            return stale
              ? existing
              : { ...existing, displayName: m.displayName, lastActivityAt: m.lastActivityAt };
          }
          return {
            sid: m.sid,
            displayName: m.displayName,
            agentId: s.agentBySid[m.sid] ?? null,
            providerOverride: s.providerOverride,
            lastActivityAt: m.lastActivityAt,
          };
        });
        // 如果 active 还在新 list 里就保留，否则掉到 [0]。空 list → null。
        const active = s.activeSid && merged.some((t) => t.sid === s.activeSid)
          ? s.activeSid
          : (merged[0]?.sid ?? null);
        const activeTab = merged.find((t) => t.sid === active) ?? null;
        persistActiveSid(active);
        return {
          tabs: merged,
          activeSid: active,
          currentSessionId: active,
          providerOverride: activeTab?.providerOverride ?? s.providerOverride,
        };
      });
    } catch (e) {
      console.warn('[refreshSessions] failed', e);
    }
  },

  switchGame: async (slug) => {
    // 一条机制,GameSwitcher.onPick 与新建 game 共用:pin → 设 server active game(使
    // 后续新建 session 绑到该 game)→ 按 game 收口刷新列表 → 落最近活跃一条/空则新建。
    get().setPinnedSlug(slug);
    try {
      const r = await fetch(`/api/workbench/games/${encodeURIComponent(slug)}/activate`, { method: 'POST' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      // pin 已切了 preview/agents,但 server 没记下 active game —— 显式报出而非默默
      // 让 session scope 错位。仍继续刷新(server 端 fallback 会按旧 active game 收口)。
      void alertDialog({
        title: t('gameSwitcher.activateFailedTitle'),
        body: t('gameSwitcher.activateFailedBody', { slug, message: (e as Error).message }),
      });
    }
    await get().refreshSessions();
    const tabs = get().tabs;
    if (tabs.length === 0) {
      // 该 game 还没有 session(新建 game / 从未用过)→ 自动建一条,保证总有可用 session。
      await get().createNewSession();
      return;
    }
    // D1:落到最近活跃的一条。switchToSession 会重连 WS,故无条件调(refreshSessions
    // 只改 tabs/activeSid,不重连 WS)。
    const recent = [...tabs].sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))[0];
    await get().switchToSession(recent.sid);
  },

  createNewSession: async (opts) => {
    const { createSession, connectForgeaXWs } = await import('./lib/forgeax-bridge');
    try {
      const bootstrap = get().defaultBootstrapAgent;
      const { sid } = await createSession({
        // 用户主动在 UI 里建 session（点 + 新建），可以传一个语义化的 displayName。
        // 不传时让 server 端落 undefined（UI 自己用 tabLabel 占位反映"无名"）。
        displayName: opts?.displayName,
        // pinnedSlug 是用户主动选的 game-project，作为新 session 的 game 默认值合理。
        defaultDir: opts?.defaultDir ?? (get().pinnedSlug ?? undefined),
        autoStart: true,
        // 用户在 Settings → Agents 里指定的「新 session 默认 agent」。null 时让
        // server 走 DEFAULT_BOOTSTRAP_AGENT='root'。是 marketplace persona id
        // 时 sessions.ts 解析 personaFile 注入到新 scaffold 的 agent.json。
        ...(bootstrap ? { bootstrapAgent: bootstrap } : {}),
      });
      const seedOverride = opts?.providerOverride !== undefined
        ? opts.providerOverride
        : get().providerOverride;
      set((s) => {
        const newTab: ChatTab = {
          sid,
          displayName: opts?.displayName,
          agentId: null,
          providerOverride: seedOverride,
        };
        const tabs = [...s.tabs, newTab];
        persistActiveSid(sid);
        return {
          tabs,
          activeSid: sid,
          currentSessionId: sid,
          providerOverride: seedOverride,
        };
      });
      connectForgeaXWs(sid);
      void _syncActiveAgentRunning(sid);
      return { sid };
    } catch (e) {
      void alertDialog({ title: t('store.createSession.failedTitle'), body: (e as Error).message });
      return null;
    }
  },

  switchToSession: async (sid) => {
    const tab = get().tabs.find((t) => t.sid === sid);
    if (!tab) {
      // 不在 tabs 里 —— 可能其它地方刚建好但本地 list 还没刷新，refresh 再试。
      await get().refreshSessions();
      const t2 = get().tabs.find((tb) => tb.sid === sid);
      if (!t2) return;
    }
    const target = get().tabs.find((t) => t.sid === sid)!;
    set({
      activeSid: sid,
      currentSessionId: sid,
      providerOverride: target.providerOverride,
    });
    persistActiveSid(sid);
    const { connectForgeaXWs } = await import('./lib/forgeax-bridge');
    connectForgeaXWs(sid);
    void _syncActiveAgentRunning(sid);
  },

  closeSession: async (sid) => {
    // liveAgents / agentFileActivity 是按 sid 累积的 write-only map(session-stream
    // 与 AgentsPanel 轮询只增不删);关 session 必须随 tab 一起摘除,否则每个关闭的
    // session 都把整棵 agent 树 + 文件活动记录永久滞留在 store 里(内存泄漏 case-05)。
    const omitSessionResidue = (s: Pick<AppState, 'liveAgents' | 'agentFileActivity' | 'agentBySid' | 'busyByAgentBySid'>) => {
      const { [sid]: _la, ...liveAgents } = s.liveAgents;
      const { [sid]: _fa, ...agentFileActivity } = s.agentFileActivity;
      // case-06: agentBySid 也按 sid 累积,且 setTabAgent 把它持久化进 localStorage
      // ('forgeax.agentBySid')。关 session 不摘 → 孤儿条目在内存 + 磁盘双重无界
      // 累积、跨刷新永不回收。随 tab 一起摘掉并回写盘(与 setTabAgent 一致)。
      const { [sid]: _ab, ...agentBySid } = s.agentBySid;
      persistAgentBySid(agentBySid);
      // busy 镜像(chat 写)随 tab 一起摘,避免关闭 session 残留 spinner 标记。
      const { [sid]: _bb, ...busyByAgentBySid } = s.busyByAgentBySid;
      return { liveAgents, agentFileActivity, agentBySid, busyByAgentBySid };
    };
    // case-10: file-activity-stream 的模块级 _state Map 按 sid 累积(file-activity
    // 事件触发 getOrInit),只增不删 → 每个关闭的 session 永久滞留一个条目。随 tab
    // 一起摘除(与 closeThreadHistoryTails 同为 per-sid 模块清理)。
    void import('./lib/file-activity-stream').then((m) => m.dropFileActivitySession(sid));

    // 2. 真删盘 —— DELETE /api/sessions/:sid。失败也照常往下走（盘上残留比 UI
    //    幽灵 tab 还在更可接受），错误吐到控制台。
    const { deleteSession, connectForgeaXWs, createSession } = await import('./lib/forgeax-bridge');
    try { await deleteSession(sid); }
    catch (e) { console.warn('[closeSession] DELETE failed', e); }

    // 3. 从 tabs 里摘掉。如果删的是最后一条 → server 立即再 createSession 兜底
    //    保证 UI 永远有一条可用 session，跟 initSessions 的"空就建一条"一致。
    const remainingMetas = get().tabs.filter((t) => t.sid !== sid);
    if (remainingMetas.length === 0) {
      try {
        const { sid: newSid } = await createSession({ autoStart: true });
        const fresh: ChatTab = {
          sid: newSid,
          displayName: undefined,
          agentId: null,
          providerOverride: loadProviderOverride(),
        };
        set((s) => ({
          tabs: [fresh],
          activeSid: newSid,
          currentSessionId: newSid,
          providerOverride: fresh.providerOverride,
          ...omitSessionResidue(s),
        }));
        persistActiveSid(newSid);
        connectForgeaXWs(newSid);
        void _syncActiveAgentRunning(newSid);
        return;
      } catch (e) {
        console.error('[closeSession] auto-create after empty failed', e);
        set((s) => ({ tabs: [], activeSid: null, currentSessionId: null, ...omitSessionResidue(s) }));
        persistActiveSid(null);
        connectForgeaXWs(null);
        return;
      }
    }

    set((s) => {
      const oldIdx = s.tabs.findIndex((t) => t.sid === sid);
      const newIdx = Math.max(0, oldIdx - 1);
      const next = remainingMetas[Math.min(newIdx, remainingMetas.length - 1)]!;
      persistActiveSid(next.sid);
      return {
        tabs: remainingMetas,
        activeSid: next.sid,
        currentSessionId: next.sid,
        providerOverride: next.providerOverride,
        ...omitSessionResidue(s),
      };
    });
    connectForgeaXWs(get().activeSid);
    void _syncActiveAgentRunning(get().activeSid);
  },

  renameTab: (sid, displayName) => {
    set((s) => patchTabField(s, sid, { displayName }));
    // TODO: 等 server 加 PATCH /api/sessions/:sid { displayName } 后写盘。当前
    // 只是 UI 临时改名，刷新会 revert 到 server 真值。
  },

  dashboardOpen: false,
  setDashboardOpen: (open) => set({ dashboardOpen: open }),
  settingsOpen: false,
  // 持久化在 localStorage —— 关掉 settings 面板再打开时回到上次的 tab；
  // 显式 openSettings(section) 仍能强制覆盖（深链/快捷打开特定页）。
  settingsSection: loadSettingsSection(),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSettingsSection: (id) => {
    saveSettingsSection(id);
    set({ settingsSection: id });
  },
  openSettings: (section) => {
    const id = section ?? get().settingsSection ?? null;
    saveSettingsSection(id);
    set({ settingsOpen: true, settingsSection: id });
  },

  fullscreen: false,
  setFullscreen: (v) => set({ fullscreen: v }),
  toggleFullscreen: () => set((s) => ({ fullscreen: !s.fullscreen })),

  sidebarCollapsed: false,
  chatpanelCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleChatpanel: () => set((s) => ({ chatpanelCollapsed: !s.chatpanelCollapsed })),

  setActiveEmitter: async (emitterId) => {
    // 重做后 activeSid 就是 server-side thread id（一一对应，不再有"tab 没绑
    // session"中间态），所以直接用 activeSid 当 PATCH /api/threads/:id 的 key。
    const { activeSid } = get();
    if (!activeSid) {
      console.warn('[setActiveEmitter] no active session');
      return;
    }
    try {
      const r = await fetch(`/api/threads/${encodeURIComponent(activeSid)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activeEmitterId: emitterId }),
      });
      if (!r.ok) {
        console.warn(`[setActiveEmitter] PATCH failed: HTTP ${r.status}`);
        return;
      }
      get().setTabAgent(activeSid, emitterId);
    } catch (e) {
      console.warn(`[setActiveEmitter] error: ${(e as Error).message}`);
    }
  },

}));
