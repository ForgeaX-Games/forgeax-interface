/**
 * Feedback store — 「写反馈 / 我的反馈」面板的自包含状态。
 *
 * Why standalone: like healthStore, this stays out of the 3k-line app store.ts.
 * It owns the panel open/tab state, the write-form draft, and the「我的反馈」
 * list fetched from the server. Server is the SSOT for records (POST/GET/PATCH
 * /api/feedback); this store only mirrors the list for display + holds the draft.
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

  // my-feedback list
  reports: FeedbackReport[];
  loading: boolean;

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
  loadReports: () => Promise<void>;
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

  reports: [],
  loading: false,

  openPanel: (tab = 'write') => {
    set({
      open: true,
      tab,
      email: readPersistedEmail(),
      lastSubmitted: null,
      submitError: null,
    });
    // 打开即静默采集现场信息,不等提交(§1)。best-effort,失败不阻塞面板。
    void captureFeedbackContext().then((context) => set({ context }));
    // Header count must be available on the write tab too; refresh again when
    // entering "mine" so its status list stays current.
    void get().loadReports();
  },
  closePanel: () => set({ open: false }),
  setTab: (tab) => {
    set({ tab });
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
      set({ submitError: 'description-required' });
      return;
    }
    if (!st.email.trim()) {
      set({ submitError: 'email-required' });
      return;
    }
    set({ submitting: true, submitError: null });
    try {
      const body: FeedbackSubmit = {
        type: st.type,
        source: 'manual',
        description: st.description.trim(),
        email: st.email.trim(),
        ...(st.screenshots.length ? { screenshots: st.screenshots.map((s) => s.ref) } : {}),
        // 上下文以提交时刻为准:优先用打开时采的,缺失则现场补采一次。
        context: st.context ?? (await captureFeedbackContext()),
      };
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as { ok?: boolean; report?: FeedbackReport; error?: string };
      if (!r.ok || !data.ok || !data.report) {
        throw new Error(data.error ?? `submit failed (${r.status})`);
      }
      set({ lastSubmitted: { id: data.report.id }, submitting: false });
    } catch (error) {
      set({ submitting: false, submitError: (error as Error).message });
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
    const body: FeedbackSubmit = {
      type: 'stuck',
      source: 'auto',
      exceptionKey: incident.exceptionKey,
      context: { ...context, logs: [...(context.logs ?? []), incident.diagnostic] },
      ...('dataUrl' in screenshot ? { screenshots: [screenshot.dataUrl] } : {}),
    };
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      // 列表可能正开着「我的反馈」;自动记录也要立刻可见。
      if (get().open) void get().loadReports();
    } catch { /* best effort —— 恢复动作比上报重要,失败不打断 */ }
  },

  loadReports: async () => {
    set({ loading: true });
    try {
      const r = await fetch('/api/feedback');
      const data = (await r.json()) as { ok?: boolean; reports?: FeedbackReport[] };
      set({ reports: data.ok && data.reports ? data.reports : [], loading: false });
    } catch {
      set({ loading: false });
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

  resetDraft: () =>
    set({
      type: 'stuck',
      description: '',
      screenshots: [],
      lastSubmitted: null,
      submitError: null,
    }),
}));
