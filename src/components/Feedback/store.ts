/**
 * Feedback store — 「写反馈 / 我的反馈」面板的自包含状态。
 *
 * Why standalone: like healthStore, this stays out of the 3k-line app store.ts.
 * It owns the panel open/tab state, the write-form draft, and the「我的反馈」
 * list fetched from the server. A durable browser outbox owns submissions that
 * have not yet received a server acknowledgement; acknowledged records remain
 * server-owned (POST/GET/PATCH /api/feedback).
 *
 * 需求:docs/features/feedback-requirement-source.md。
 * schema 契约 SSOT 在 @forgeax/types/feedback —— 这里只 import 类型,不重定义。
 */

import { create } from 'zustand';
import type {
  FeedbackReport,
  FeedbackStatus,
  FeedbackSubmit,
  FeedbackType,
} from '@forgeax/types/feedback';
import { STORAGE_KEYS } from '../../lib/storageKeys';
import { captureUiScreenshot } from '../../lib/ui-screenshot';
import { captureFeedbackContext } from './collect';
import {
  deletePendingFeedback,
  listPendingFeedback,
  putPendingFeedback,
  type PendingFeedbackSubmission,
} from './pending-store';

export type FeedbackTab = 'write' | 'mine';

interface DraftScreenshot {
  /** 预览用 dataUrl(当前快照)或 object URL(本地上传)。 */
  previewUrl: string;
  /** 提交给 server 的引用。当前快照为 dataUrl;上传为 dataUrl(MVP:直接随 body 走)。 */
  ref: string;
  kind: 'snapshot' | 'upload';
}

interface FeedbackStore {
  open: boolean;
  tab: FeedbackTab;
  /** 打开面板时即静默采集的现场信息(§1/§5),提交时带走。 */
  context: FeedbackSubmit['context'] | null;

  // write-form draft
  type: FeedbackType;
  description: string;
  email: string;
  screenshots: DraftScreenshot[];
  submitting: boolean;
  /** 提交成功后展示的编号;关闭/重开面板时清空。 */
  lastSubmitted: { id: string } | null;
  submitError: string | null;
  /** Raw browser/server detail kept separate from the stable UI-facing code. */
  submitErrorDetail: string | null;
  /** Incremented for every valid manual submit click so repeated failures remain visible. */
  submitAttempts: number;
  lastSubmitAttemptAt: number | null;
  /** Reuses one durable outbox entry while the current draft is retried. */
  activePendingId: string | null;

  // my-feedback list
  reports: FeedbackReport[];
  pendingSubmissions: PendingFeedbackSubmission[];
  retryingPendingIds: string[];
  loading: boolean;
  refreshFailed: boolean;
  loadError: string | null;
  loadErrorDetail: string | null;

  openPanel: (tab?: FeedbackTab) => void;
  closePanel: () => void;
  setTab: (tab: FeedbackTab) => void;

  setType: (t: FeedbackType) => void;
  setDescription: (v: string) => void;
  setEmail: (v: string) => void;
  addScreenshot: (s: DraftScreenshot) => void;
  removeScreenshot: (index: number) => void;

  submit: () => Promise<void>;
  /** 被动异常卡片的零输入自动提交(§4.3)。不碰草稿、不产生回执。 */
  submitAuto: (incident: AutoFeedbackIncident) => Promise<void>;
  loadReports: (options?: { silent?: boolean }) => Promise<void>;
  retryPending: (id: string) => Promise<void>;
  setStatus: (id: string, status: FeedbackStatus) => Promise<void>;
  resetDraft: () => void;
}

/** 被动卡片提交所需的最小事实。UI 只描述「出了什么事」,
 *  采集/截图/组包/发请求都归 store —— /api/feedback 的唯一出口(见文件头 SSOT 注释)。 */
export interface AutoFeedbackIncident {
  exceptionKey: string;
  /** 一行技术摘要 + 可选堆栈,落进 context.logs 供后台定位。 */
  diagnostic: string;
}

function readPersistedEmail(): string {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEYS.feedbackEmail)?.trim() ?? '';
  } catch {
    return '';
  }
}

function persistEmail(email: string): void {
  try {
    const value = email.trim();
    if (value) globalThis.localStorage?.setItem(STORAGE_KEYS.feedbackEmail, value);
    else globalThis.localStorage?.removeItem(STORAGE_KEYS.feedbackEmail);
  } catch {
    // The form remains usable when storage is unavailable or blocked.
  }
}

const HEALTH_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 15_000;

type FeedbackRequestErrorCode =
  | 'server-unreachable'
  | 'request-timeout'
  | 'request-failed'
  | 'invalid-response'
  | 'submit-rejected'
  | 'load-failed'
  | 'local-save-failed';

class FeedbackRequestError extends Error {
  constructor(
    readonly code: FeedbackRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FeedbackRequestError';
  }
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function requestOrigin(): string {
  try {
    return globalThis.location?.origin ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new FeedbackRequestError('request-timeout', `request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function probeFeedbackServer(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const response = await fetchWithTimeout('/api/health', { cache: 'no-store' }, HEALTH_TIMEOUT_MS);
    return response.ok
      ? { ok: true }
      : { ok: false, detail: `/api/health returned HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: errorDetail(error) };
  }
}

async function postFeedback(body: FeedbackSubmit): Promise<FeedbackReport> {
  const response = await fetchWithTimeout('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: { ok?: boolean; report?: FeedbackReport; error?: string };
  try {
    data = (await response.json()) as typeof data;
  } catch (error) {
    throw new FeedbackRequestError('invalid-response', errorDetail(error));
  }
  if (!response.ok || !data.ok || !data.report) {
    throw new FeedbackRequestError('submit-rejected', data.error ?? `submit failed (${response.status})`);
  }
  return data.report;
}

function pendingId(): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `LOCAL-${uuid}`;
}

function upsertPending(
  entries: PendingFeedbackSubmission[],
  next: PendingFeedbackSubmission,
): PendingFeedbackSubmission[] {
  return [next, ...entries.filter((entry) => entry.id !== next.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function classifyRequestFailure(
  error: unknown,
  fallback: FeedbackRequestErrorCode,
): Promise<{ code: FeedbackRequestErrorCode; detail: string }> {
  if (error instanceof FeedbackRequestError) {
    return { code: error.code, detail: error.message };
  }
  const health = await probeFeedbackServer();
  return {
    code: health.ok ? fallback : 'server-unreachable',
    detail: health.ok ? errorDetail(error) : (health.detail ?? errorDetail(error)),
  };
}

function warnRequestFailure(
  operation: 'submit' | 'load',
  failure: { code: FeedbackRequestErrorCode; detail: string },
  attempt?: number,
): void {
  console.warn(`[feedback] ${operation} failed`, {
    endpoint: '/api/feedback',
    origin: requestOrigin(),
    code: failure.code,
    detail: failure.detail,
    ...(attempt === undefined ? {} : { attempt }),
  });
}

let reportsRequest: Promise<void> | undefined;

/** Fields to clear once a submission has been acknowledged (`lastSubmitted`
 *  set) — everywhere the user leaves that acknowledgement behind (switch tab,
 *  reopen panel) should hand back a blank form, not the previous draft.
 *  Email is never included: it is the one field meant to persist. */
function draftResetFields(): Pick<
  FeedbackStore,
  | 'type'
  | 'description'
  | 'screenshots'
  | 'lastSubmitted'
  | 'submitError'
  | 'submitErrorDetail'
  | 'submitAttempts'
  | 'lastSubmitAttemptAt'
  | 'activePendingId'
> {
  return {
    type: 'stuck',
    description: '',
    screenshots: [],
    lastSubmitted: null,
    submitError: null,
    submitErrorDetail: null,
    submitAttempts: 0,
    lastSubmitAttemptAt: null,
    activePendingId: null,
  };
}

export const useFeedbackStore = create<FeedbackStore>((set, get) => ({
  open: false,
  tab: 'write',
  context: null,

  type: 'stuck',
  description: '',
  email: readPersistedEmail(),
  screenshots: [],
  submitting: false,
  lastSubmitted: null,
  submitError: null,
  submitErrorDetail: null,
  submitAttempts: 0,
  lastSubmitAttemptAt: null,
  activePendingId: null,

  reports: [],
  pendingSubmissions: [],
  retryingPendingIds: [],
  loading: false,
  refreshFailed: false,
  loadError: null,
  loadErrorDetail: null,

  openPanel: (tab = 'write') => {
    set((st) => ({
      open: true,
      tab,
      email: readPersistedEmail(),
      ...(st.lastSubmitted
        ? draftResetFields()
        : {
            lastSubmitted: null,
            submitError: null,
            submitErrorDetail: null,
          }),
    }));
    // 打开即静默采集现场信息,不等提交(§1)。best-effort,失败不阻塞面板。
    void captureFeedbackContext().then((context) => set({ context }));
    // Header count must be available on the write tab too; refresh again when
    // entering "mine" so its status list stays current.
    void get().loadReports();
  },
  closePanel: () => set({ open: false }),
  setTab: (tab) => {
    // A prior submission's receipt (lastSubmitted) must not survive a round
    // trip through another tab — otherwise re-entering "write" either shows
    // the stale success screen again or brings back the old draft fields.
    set({ tab, ...(get().lastSubmitted ? draftResetFields() : {}) });
    if (tab === 'mine') void get().loadReports();
  },

  setType: (type) => set({ type }),
  setDescription: (description) => set({ description }),
  setEmail: (email) => {
    persistEmail(email);
    set({ email });
  },
  addScreenshot: (s) =>
    set((st) => (st.screenshots.length >= 5 ? st : { screenshots: [...st.screenshots, s] })),
  removeScreenshot: (index) =>
    set((st) => ({ screenshots: st.screenshots.filter((_, i) => i !== index) })),

  submit: async () => {
    const st = get();
    if (!st.description.trim()) {
      set({ submitError: 'description-required', submitErrorDetail: null });
      return;
    }
    if (!st.email.trim()) {
      set({ submitError: 'email-required', submitErrorDetail: null });
      return;
    }
    const attempt = st.submitAttempts + 1;
    const attemptedAt = Date.now();
    set({
      submitting: true,
      submitError: null,
      submitErrorDetail: null,
      submitAttempts: attempt,
      lastSubmitAttemptAt: attemptedAt,
    });
    const body: FeedbackSubmit = {
      type: st.type,
      source: 'manual',
      description: st.description.trim(),
      email: st.email.trim(),
      ...(st.screenshots.length ? { screenshots: st.screenshots.map((s) => s.ref) } : {}),
      // 上下文以提交时刻为准:优先用打开时采的,缺失则现场补采一次。
      context: st.context ?? (await captureFeedbackContext()),
    };
    const localId = st.activePendingId ?? pendingId();
    const previous = st.pendingSubmissions.find((entry) => entry.id === localId);
    let pending: PendingFeedbackSubmission = {
      id: localId,
      submit: body,
      createdAt: previous?.createdAt ?? new Date(attemptedAt).toISOString(),
      updatedAt: new Date(attemptedAt).toISOString(),
      attempts: attempt,
      ...(previous?.lastError ? { lastError: previous.lastError } : {}),
    };
    try {
      // Durable-before-network: even a process/connection failure after this
      // point leaves a visible, retryable entry in "My feedback".
      await putPendingFeedback(pending);
      set((current) => ({
        activePendingId: localId,
        pendingSubmissions: upsertPending(current.pendingSubmissions, pending),
      }));
    } catch (error) {
      const failure = { code: 'local-save-failed' as const, detail: errorDetail(error) };
      warnRequestFailure('submit', failure, attempt);
      set({ submitting: false, submitError: failure.code, submitErrorDetail: failure.detail });
      return;
    }

    try {
      // A same-origin health probe distinguishes a dead/restarting desktop
      // sidecar from feedback validation or persistence errors. In WKWebView
      // both otherwise collapse to the opaque `TypeError: Load failed`.
      const health = await probeFeedbackServer();
      if (!health.ok) {
        throw new FeedbackRequestError('server-unreachable', health.detail ?? 'local server is unreachable');
      }
      // Reaching /api/health also proves a stale list error is no longer current.
      set({ loadError: null, loadErrorDetail: null });

      const report = await postFeedback(body);
      await deletePendingFeedback(localId);
      set((current) => ({
        lastSubmitted: { id: report.id },
        submitting: false,
        activePendingId: null,
        pendingSubmissions: current.pendingSubmissions.filter((entry) => entry.id !== localId),
      }));
    } catch (error) {
      const failure = await classifyRequestFailure(error, 'request-failed');
      warnRequestFailure('submit', failure, attempt);
      pending = {
        ...pending,
        updatedAt: new Date().toISOString(),
        lastError: failure.detail,
      };
      try { await putPendingFeedback(pending); } catch { /* the original durable copy still exists */ }
      set({
        submitting: false,
        submitError: failure.code,
        submitErrorDetail: failure.detail,
        pendingSubmissions: upsertPending(get().pendingSubmissions, pending),
      });
    }
  },

  submitAuto: async (incident) => {
    // §4.3 零输入:不填描述/邮箱/类型,一律记为「崩溃或无响应」。
    // 与 submit() 分开,是因为它既不读草稿也不写 lastSubmitted —— 被动卡片不展示回执。
    // 现场必须以「异常触发时刻」为准(§5),不复用面板打开时那份快照。
    const [context, screenshot] = await Promise.all([
      captureFeedbackContext(),
      captureUiScreenshot({ target: 'app' }),
    ]);
    const email = readPersistedEmail();
    const body: FeedbackSubmit = {
      type: 'stuck',
      source: 'auto',
      exceptionKey: incident.exceptionKey,
      // Zero-input does not have to mean anonymous: reuse only an address the
      // user previously chose to persist through the manual feedback form.
      ...(email ? { email } : {}),
      context: { ...context, logs: [...(context.logs ?? []), incident.diagnostic] },
      ...('dataUrl' in screenshot ? { screenshots: [screenshot.dataUrl] } : {}),
    };
    const now = new Date().toISOString();
    let pending: PendingFeedbackSubmission = {
      id: pendingId(),
      submit: body,
      createdAt: now,
      updatedAt: now,
      attempts: 1,
    };
    let persisted = false;
    try {
      await putPendingFeedback(pending);
      persisted = true;
      set((current) => ({ pendingSubmissions: upsertPending(current.pendingSubmissions, pending) }));
    } catch {
      // Automatic recovery still takes priority; try the network even if the
      // browser has disabled both IndexedDB and localStorage.
    }
    try {
      await postFeedback(body);
      if (persisted) await deletePendingFeedback(pending.id);
      // 列表可能正开着「我的反馈」;自动记录也要立刻可见。
      if (get().open) void get().loadReports();
    } catch (error) {
      if (persisted) {
        pending = { ...pending, updatedAt: new Date().toISOString(), lastError: errorDetail(error) };
        try { await putPendingFeedback(pending); } catch { /* original copy remains */ }
        set((current) => ({ pendingSubmissions: upsertPending(current.pendingSubmissions, pending) }));
      }
      // best effort —— 恢复动作比上报重要,失败不打断
    }
  },

  loadReports: async ({ silent = false } = {}) => {
    // Tab entry and the five-second delivery poll share one request. Besides
    // avoiding duplicate traffic, this prevents a slower stale response from
    // overwriting a newer delivery status.
    if (reportsRequest) return reportsRequest;
    reportsRequest = (async () => {
      if (!silent) set({ loading: true, loadError: null, loadErrorDetail: null });
      const pendingPromise = listPendingFeedback();
      try {
        const r = await fetchWithTimeout('/api/feedback', { cache: 'no-store' }, 10_000);
        let data: { ok?: boolean; reports?: FeedbackReport[]; error?: string };
        try {
          data = (await r.json()) as typeof data;
        } catch (error) {
          throw new FeedbackRequestError('invalid-response', errorDetail(error));
        }
        if (!r.ok || !data.ok || !Array.isArray(data.reports)) {
          throw new FeedbackRequestError('load-failed', data.error ?? `load failed (${r.status})`);
        }
        set({
          reports: data.reports,
          pendingSubmissions: await pendingPromise,
          refreshFailed: false,
          loadError: null,
          loadErrorDetail: null,
        });
      } catch (error) {
        const failure = await classifyRequestFailure(error, 'load-failed');
        warnRequestFailure('load', failure);
        // Keep both the last acknowledged cards and the durable local outbox.
        // Background polling uses a compact stale-status warning; an explicit
        // load exposes the actionable transport detail and retry button.
        set({
          refreshFailed: true,
          ...(silent ? {} : { loadError: failure.code, loadErrorDetail: failure.detail }),
          pendingSubmissions: await pendingPromise,
        });
      } finally {
        if (!silent) set({ loading: false });
      }
    })().finally(() => { reportsRequest = undefined; });
    return reportsRequest;
  },

  retryPending: async (id) => {
    const existing = get().pendingSubmissions.find((entry) => entry.id === id);
    if (!existing || get().retryingPendingIds.includes(id)) return;
    let pending: PendingFeedbackSubmission = {
      ...existing,
      attempts: existing.attempts + 1,
      updatedAt: new Date().toISOString(),
    };
    set((current) => ({
      retryingPendingIds: [...current.retryingPendingIds, id],
      pendingSubmissions: upsertPending(current.pendingSubmissions, pending),
    }));
    try { await putPendingFeedback(pending); } catch { /* existing durable entry remains */ }

    try {
      const health = await probeFeedbackServer();
      if (!health.ok) {
        throw new FeedbackRequestError('server-unreachable', health.detail ?? 'local server is unreachable');
      }
      const report = await postFeedback(pending.submit);
      await deletePendingFeedback(id);
      set((current) => ({
        reports: [report, ...current.reports.filter((entry) => entry.id !== report.id)],
        pendingSubmissions: current.pendingSubmissions.filter((entry) => entry.id !== id),
      }));
    } catch (error) {
      const failure = await classifyRequestFailure(error, 'request-failed');
      warnRequestFailure('submit', failure, pending.attempts);
      pending = { ...pending, updatedAt: new Date().toISOString(), lastError: failure.detail };
      try { await putPendingFeedback(pending); } catch { /* existing durable entry remains */ }
      set((current) => ({ pendingSubmissions: upsertPending(current.pendingSubmissions, pending) }));
    } finally {
      set((current) => ({ retryingPendingIds: current.retryingPendingIds.filter((entry) => entry !== id) }));
    }
  },

  setStatus: async (id, status) => {
    try {
      const r = await fetch(`/api/feedback/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = (await r.json()) as { ok?: boolean; report?: FeedbackReport };
      if (r.ok && data.ok && data.report) {
        set((st) => ({
          reports: st.reports.map((x) => (x.id === id ? data.report! : x)),
        }));
      }
    } catch { /* best effort */ }
  },

  resetDraft: () => set(draftResetFields()),
}));
