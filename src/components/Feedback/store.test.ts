/**
 * Feedback store 契约测试 —— 覆盖 §4.3「被动卡片零输入自动提交」。
 *
 * 这里只测 submitAuto:它是 /api/feedback 的唯一出口(见 store.ts 文件头 +
 * scripts/agnostic-api-policy.ts),被动卡片把事实交给它,组包与上报都在这一层。
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { STORAGE_KEYS } from '../../lib/storageKeys';
import { useFeedbackStore } from './store';

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

const realFetch = globalThis.fetch;

/** 拦截 fetch,记录 POST /api/feedback 的实际请求体。 */
function stubFetch(opts: { fail?: boolean } = {}): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/feedback' && init?.method === 'POST') {
      if (opts.fail) throw new Error('network down');
      calls.push({ url, body: JSON.parse(String(init.body)) });
    }
    return new Response(JSON.stringify({ ok: true, reports: [] }), {
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.clear();
  useFeedbackStore.setState({
    open: false,
    context: null,
    description: '',
    email: '',
    screenshots: [],
    submitting: false,
    submitError: null,
    lastSubmitted: null,
    reports: [],
  });
});

describe('manual feedback email', () => {
  test('blocks a manual submission when email is missing', async () => {
    const calls = stubFetch();
    useFeedbackStore.setState({
      description: 'Play freezes after loading',
      email: '',
      context: { logs: [] },
    });

    await useFeedbackStore.getState().submit();

    expect(calls).toHaveLength(0);
    expect(useFeedbackStore.getState().submitError).toBe('email-required');
  });

  test('persists a trimmed email and keeps it when the draft resets', () => {
    useFeedbackStore.getState().setEmail('  player@example.com  ');

    expect(localStorage.getItem(STORAGE_KEYS.feedbackEmail)).toBe('player@example.com');
    useFeedbackStore.getState().resetDraft();
    expect(useFeedbackStore.getState().email).toBe('  player@example.com  ');
  });

  test('restores the persisted email when the panel opens again', () => {
    stubFetch();
    localStorage.setItem(STORAGE_KEYS.feedbackEmail, 'player@example.com');
    useFeedbackStore.setState({ email: '' });

    useFeedbackStore.getState().openPanel();

    expect(useFeedbackStore.getState().email).toBe('player@example.com');
  });
});

describe('submitAuto (§4.3 zero-input auto record)', () => {
  test('forces type=stuck + source=auto and carries the exception key for dedupe', async () => {
    const calls = stubFetch();
    // 关键:草稿里先放一个非 stuck 的类型。若 submitAuto 读了草稿而不是写死 stuck,
    // 下面的断言就会失败 —— 默认值恰好是 stuck,不设这一步等于没测。
    useFeedbackStore.setState({ type: 'idea' });

    await useFeedbackStore.getState().submitAuto({
      exceptionKey: 'gpu-device-lost',
      diagnostic: '[passive-feedback/gpu-device-lost] device lost',
    });

    expect(calls).toHaveLength(1);
    // §4.3:不填描述/邮箱/类型,一律记为「崩溃或无响应」= stuck。
    expect(calls[0].body).toMatchObject({
      type: 'stuck',
      source: 'auto',
      exceptionKey: 'gpu-device-lost',
    });
    // 零输入意味着这两个字段根本不出现,而不是空串。
    expect(calls[0].body.description).toBeUndefined();
    expect(calls[0].body.email).toBeUndefined();
  });

  test('appends the diagnostic to the collected logs so the stack survives', async () => {
    const calls = stubFetch();
    const diagnostic = '[passive-feedback/save-failure] disk rejected\n  at write()';

    await useFeedbackStore.getState().submitAuto({ exceptionKey: 'save-failure', diagnostic });

    const context = calls[0].body.context as { logs?: string[] };
    expect(context.logs?.at(-1)).toBe(diagnostic);
  });

  test('never shows a receipt and never touches the write draft', async () => {
    stubFetch();
    useFeedbackStore.setState({ description: 'user typed this', type: 'ui' });

    await useFeedbackStore.getState().submitAuto({
      exceptionKey: 'main-thread-stall',
      diagnostic: 'stalled 6s',
    });

    // 被动卡片提交后「卡片立即关闭,不展示回执」——lastSubmitted 必须保持空。
    expect(useFeedbackStore.getState().lastSubmitted).toBeNull();
    // 自动上报强制 stuck,但不能把用户正在写的草稿改掉。
    expect(useFeedbackStore.getState().description).toBe('user typed this');
    expect(useFeedbackStore.getState().type).toBe('ui');
  });

  test('swallows upload failure — the recovery action must not be blocked', async () => {
    stubFetch({ fail: true });

    // 不 throw 才能让调用方继续跑恢复动作(重启预览 / 刷新页面)。
    await useFeedbackStore.getState().submitAuto({
      exceptionKey: 'renderer-crash',
      diagnostic: 'carrier died',
    });

    expect(useFeedbackStore.getState().lastSubmitted).toBeNull();
  });
});
