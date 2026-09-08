/**
 * 浏览器 tracer 单测(P3):ui.send/ui.request/ui.stream/ui.render 一棵树、同 traceId、parent 链正确,
 * traceparent 格式合法。prelude 必须先 import(阻 store 模块加载自动连 daemon-WS)。
 */
import './telemetry-test-prelude';
import { describe, it, expect, beforeEach } from 'bun:test';
import { useShellStore, type TelemetrySpan } from '../store';
import {
  AGENT_UNRESPONSIVE_TIMEOUT_MS,
  beginChatTurn,
  chatFirstToken,
  chatToolResult,
  chatTurnEnd,
  toTraceparent,
  beginAppBoot,
  appBootSpan,
  endAppBoot,
} from './trace';
import { PASSIVE_FEEDBACK_EVENT, PASSIVE_FEEDBACK_RECOVERED_EVENT, type PassiveFeedbackSignal, type PassiveFeedbackResolution } from './passive-feedback';

const spans = (): TelemetrySpan[] =>
  useShellStore.getState().telemetry.filter((r): r is TelemetrySpan => r.kind === 'span');
const finals = (name: string): TelemetrySpan[] => spans().filter((s) => s.name === name && s.endTs != null);

interface FakeTimer {
  id: number;
  callback: () => void;
  due: number;
  ms: number;
  cleared: boolean;
}

/** Small deterministic clock: unlike a callback-only stub, this proves the 150s/600s boundary. */
function installFakeTimers() {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const timers: FakeTimer[] = [];
  let now = 0;
  let nextId = 1;
  const fakeSet = ((callback: () => void, ms = 0) => {
    const timer: FakeTimer = { id: nextId++, callback, due: now + ms, ms, cleared: false };
    timers.push(timer);
    return timer.id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  const fakeClear = ((handle: ReturnType<typeof setTimeout>) => {
    const timer = timers.find((candidate) => candidate.id === (handle as unknown as number));
    if (timer) timer.cleared = true;
  }) as typeof clearTimeout;
  globalThis.setTimeout = fakeSet;
  globalThis.clearTimeout = fakeClear;

  const advanceBy = (ms: number): void => {
    const target = now + ms;
    for (;;) {
      const next = timers
        .filter((timer) => !timer.cleared && timer.due <= target)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!next) break;
      next.cleared = true;
      now = next.due;
      next.callback();
    }
    now = target;
  };
  const stallTimers = (): FakeTimer[] => timers.filter((timer) => timer.ms === AGENT_UNRESPONSIVE_TIMEOUT_MS && !timer.cleared);
  const restore = (): void => {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  };
  return { timers, advanceBy, stallTimers, restore };
}

beforeEach(() => {
  useShellStore.setState({ telemetry: [] });
  // rAF 同步化,让 chatTurnEnd 的 ui.render/ui.send 收尾确定性发生。
  (globalThis as { requestAnimationFrame?: (cb: () => void) => void }).requestAnimationFrame = (cb) => {
    cb();
    return 0 as unknown as number;
  };
  // stub fetch:flushTelemetryUpload 在 chatTurnEnd 里会 POST /api/telemetry,测试里设成 no-op。
  (globalThis as { fetch?: unknown }).fetch = () => Promise.resolve({ ok: true } as Response);
});

describe('browser tracer chat.turn', () => {
  it('beginChatTurn returns a valid W3C traceparent and emits ui.send+ui.request provisional', () => {
    const { traceparent } = beginChatTurn('forge', 'sid-1');
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    const provisional = spans().filter((s) => s.provisional);
    expect(provisional.map((s) => s.name).sort()).toEqual(['ui.request', 'ui.send']);
    // ui.request 挂在 ui.send 下,且 traceparent 指向 ui.request
    const send = provisional.find((s) => s.name === 'ui.send')!;
    const req = provisional.find((s) => s.name === 'ui.request')!;
    expect(req.parentSpanId).toBe(send.spanId);
    expect(traceparent).toContain(req.traceId);
    expect(traceparent).toContain(req.spanId);
    chatTurnEnd('forge', 'ok');
  });

  it('full turn → one trace, correct parent chain: send → {request, stream, render}', () => {
    beginChatTurn('forge', 'sid-1');
    chatFirstToken('forge');
    chatFirstToken('forge'); // 幂等,不重复起 ui.stream
    chatTurnEnd('forge', 'ok');

    const send = finals('ui.send')[0]!;
    const req = finals('ui.request')[0]!;
    const stream = finals('ui.stream')[0]!;
    const render = finals('ui.render')[0]!;
    // 全部同一 traceId
    const tid = send.traceId;
    for (const s of [req, stream, render]) expect(s.traceId).toBe(tid);
    // ui.send 是 root(无 parent);request/stream/render 都挂 ui.send 下
    expect(send.parentSpanId).toBeUndefined();
    for (const s of [req, stream, render]) expect(s.parentSpanId).toBe(send.spanId);
    // 都有 endTs + ok 状态
    for (const s of [send, req, stream, render]) {
      expect(typeof s.endTs).toBe('number');
      expect(s.status?.code).toBe('ok');
    }
    // 仅一棵(幂等):各 final 只一条
    expect(finals('ui.stream').length).toBe(1);
    expect(finals('ui.send').length).toBe(1);
  });

  it('取消:status 走 ok(不污染错误率),但 root span 留 cancelled 标记', () => {
    // 三值收尾的理由:标 error,错误率里就全是用户主动停的假失败;并进 ok,误触取消风暴
    // 在监控里又和健康流量长得一模一样 —— 追溯系统不该亲手销毁取消信号。
    beginChatTurn('forge', 'sid-1');
    chatFirstToken('forge');
    chatTurnEnd('forge', 'cancelled');
    const send = finals('ui.send')[0]!;
    expect(send.status?.code).toBe('ok');
    expect((send.attrs as Record<string, unknown> | undefined)?.cancelled).toBe(true);
  });

  it('error turn → spans carry error status + message', () => {
    beginChatTurn('forge', 'sid-1');
    chatFirstToken('forge');
    chatTurnEnd('forge', 'error', 'boom');
    const send = finals('ui.send')[0]!;
    expect(send.status?.code).toBe('error');
    const stream = finals('ui.stream')[0]!;
    expect(stream.status).toEqual({ code: 'error', message: 'boom' });
  });

  it('degenerate turn (no token) still closes ui.request + ui.send', () => {
    beginChatTurn('forge', 'sid-1');
    chatTurnEnd('forge', 'ok'); // 无 first token
    expect(finals('ui.request').length).toBe(1);
    expect(finals('ui.send').length).toBe(1);
    expect(finals('ui.stream').length).toBe(0); // 没起过 stream
  });

  it('concurrent agents keep separate traces (no cross-parent)', () => {
    beginChatTurn('forge', 'sid-1');
    beginChatTurn('mochi', 'sid-1');
    chatFirstToken('forge');
    chatFirstToken('mochi');
    chatTurnEnd('forge', 'ok');
    chatTurnEnd('mochi', 'ok');
    const sends = finals('ui.send');
    expect(sends.length).toBe(2);
    expect(sends[0].traceId).not.toBe(sends[1].traceId);
    // 每个 agent 的 stream 挂自己的 send
    const fSend = sends.find((s) => s.agentId === 'forge')!;
    const fStream = finals('ui.stream').find((s) => s.agentId === 'forge')!;
    expect(fStream.parentSpanId).toBe(fSend.spanId);
    expect(fStream.traceId).toBe(fSend.traceId);
  });

  it('hidden tab → ui.render/ui.send close immediately (no rAF) with paintDeferred attr', () => {
    // rAF 设成「永不回调」,证明失焦分支不依赖 rAF 也能收口(否则 render 永挂、被「回前台耗时」污染)。
    (globalThis as { requestAnimationFrame?: (cb: () => void) => void }).requestAnimationFrame = () =>
      0 as unknown as number;
    const doc = (globalThis as { document?: object }).document;
    const desc = doc ? Object.getOwnPropertyDescriptor(doc, 'visibilityState') : undefined;
    try {
      if (doc) Object.defineProperty(doc, 'visibilityState', { value: 'hidden', configurable: true });
      beginChatTurn('forge', 'sid-h');
      chatFirstToken('forge');
      chatTurnEnd('forge', 'ok');
      const render = finals('ui.render')[0]!;
      const send = finals('ui.send')[0]!;
      // 失焦也立刻收口(不等 rAF):render + send 都已 endTs
      expect(typeof render.endTs).toBe('number');
      expect(typeof send.endTs).toBe('number');
      // 标 paintDeferred:提示这不是真实绘制耗时,而是标签页失焦延后
      expect((render.attrs as { paintDeferred?: boolean } | undefined)?.paintDeferred).toBe(true);
      expect((send.attrs as { paintDeferred?: boolean } | undefined)?.paintDeferred).toBe(true);
    } finally {
      if (doc && desc) Object.defineProperty(doc, 'visibilityState', desc);
      else if (doc) Object.defineProperty(doc, 'visibilityState', { value: 'visible', configurable: true });
    }
  });

  it('stall watchdog: 150s of generation remains working; first warning is exactly 600000ms', () => {
    const clock = installFakeTimers();
    try {
      beginChatTurn('forge', 'sid-stall', 'codebuddy');
      expect(clock.stallTimers()).toHaveLength(1);
      clock.advanceBy(150_000);
      expect(finals('ui.stall')).toHaveLength(0);
      expect(clock.stallTimers()).toHaveLength(1);
    } finally {
      chatTurnEnd('forge', 'ok');
      clock.restore();
    }
  });

  it('stall watchdog: 600s emits one scoped reconnect feedback and keeps observing after the threshold', () => {
    const clock = installFakeTimers();
    const signals: PassiveFeedbackSignal[] = [];
    const onSignal = (event: Event) => signals.push((event as CustomEvent<PassiveFeedbackSignal>).detail);
    window.addEventListener(PASSIVE_FEEDBACK_EVENT, onSignal);
    try {
      beginChatTurn('forge', 'sid-stall', 'codebuddy');
      clock.advanceBy(AGENT_UNRESPONSIVE_TIMEOUT_MS - 1);
      expect(finals('ui.stall')).toHaveLength(0);
      clock.advanceBy(1);
      const stall = finals('ui.stall')[0];
      expect(stall).toBeTruthy();
      expect(stall!.status?.code).toBe('error');
      expect((stall!.attrs as { waitedMs?: number; kernel?: string } | undefined)?.waitedMs).toBe(600_000);
      expect((stall!.attrs as { waitedMs?: number; kernel?: string } | undefined)?.kernel).toBe('codebuddy');
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({ code: 'ui.stall', scope: { sid: 'sid-stall', agentId: 'forge' } });
      // The diagnostic path remains alive beyond the first warning, but it is
      // still one 600s cadence rather than a 30/60/90s false-positive loop.
      expect(clock.stallTimers()).toHaveLength(1);
    } finally {
      window.removeEventListener(PASSIVE_FEEDBACK_EVENT, onSignal);
      chatTurnEnd('forge', 'ok');
      clock.restore();
    }
  });

  it('successful assistant response clears the 600s timer and stale alert', () => {
    const clock = installFakeTimers();
    const recoveries: PassiveFeedbackResolution[] = [];
    const onRecovered = (event: Event) => recoveries.push((event as CustomEvent<PassiveFeedbackResolution>).detail);
    window.addEventListener(PASSIVE_FEEDBACK_RECOVERED_EVENT, onRecovered);
    try {
      beginChatTurn('forge', 'sid-response', 'codebuddy');
      clock.advanceBy(AGENT_UNRESPONSIVE_TIMEOUT_MS);
      expect(finals('ui.stall')).toHaveLength(1);
      chatFirstToken('forge');
      expect(clock.stallTimers()).toHaveLength(0);
      expect(recoveries).toEqual([{ exceptionKey: 'agent-unresponsive', scope: { sid: 'sid-response', agentId: 'forge' } }]);
      clock.advanceBy(AGENT_UNRESPONSIVE_TIMEOUT_MS * 2);
      expect(finals('ui.stall')).toHaveLength(1);
    } finally {
      window.removeEventListener(PASSIVE_FEEDBACK_RECOVERED_EVENT, onRecovered);
      chatTurnEnd('forge', 'ok');
      clock.restore();
    }
  });

  it('tool result clears the 600s timer even when no text token arrived', () => {
    const clock = installFakeTimers();
    try {
      beginChatTurn('forge', 'sid-tool', 'codebuddy');
      clock.advanceBy(AGENT_UNRESPONSIVE_TIMEOUT_MS);
      expect(finals('ui.stall')).toHaveLength(1);
      chatToolResult('forge');
      expect(clock.stallTimers()).toHaveLength(0);
      clock.advanceBy(AGENT_UNRESPONSIVE_TIMEOUT_MS);
      expect(finals('ui.stall')).toHaveLength(1);
    } finally {
      chatTurnEnd('forge', 'ok');
      clock.restore();
    }
  });

  it('cancellation clears the watchdog and stale alert without waiting for a backend turnEnd', () => {
    const clock = installFakeTimers();
    const recoveries: PassiveFeedbackResolution[] = [];
    const onRecovered = (event: Event) => recoveries.push((event as CustomEvent<PassiveFeedbackResolution>).detail);
    window.addEventListener(PASSIVE_FEEDBACK_RECOVERED_EVENT, onRecovered);
    try {
      beginChatTurn('forge', 'sid-cancel', 'codebuddy');
      clock.advanceBy(AGENT_UNRESPONSIVE_TIMEOUT_MS);
      expect(finals('ui.stall')).toHaveLength(1);
      chatTurnEnd('forge', 'cancelled');
      expect(clock.stallTimers()).toHaveLength(0);
      expect(recoveries).toEqual([{ exceptionKey: 'agent-unresponsive', scope: { sid: 'sid-cancel', agentId: 'forge' } }]);
      clock.advanceBy(AGENT_UNRESPONSIVE_TIMEOUT_MS);
      expect(finals('ui.stall')).toHaveLength(1);
      expect((finals('ui.send')[0]!.attrs as { cancelled?: boolean } | undefined)?.cancelled).toBe(true);
    } finally {
      window.removeEventListener(PASSIVE_FEEDBACK_RECOVERED_EVENT, onRecovered);
      chatTurnEnd('forge', 'cancelled');
      clock.restore();
    }
  });

  it('repeated turns do not leak timers or let a stale callback report for the replacement', () => {
    const clock = installFakeTimers();
    try {
      beginChatTurn('forge', 'sid-old', 'codebuddy');
      const oldTimer = clock.stallTimers()[0]!;
      beginChatTurn('forge', 'sid-new', 'codebuddy');
      expect(oldTimer.cleared).toBe(true);
      expect(clock.stallTimers()).toHaveLength(1);

      // A queued callback can still run after clearTimeout in browsers and in
      // fake timers; identity checking must make it a no-op.
      oldTimer.callback();
      expect(finals('ui.stall')).toHaveLength(0);

      clock.advanceBy(AGENT_UNRESPONSIVE_TIMEOUT_MS);
      expect(finals('ui.stall')).toHaveLength(1);
      chatTurnEnd('forge', 'ok');
      expect(clock.stallTimers()).toHaveLength(0);
    } finally {
      chatTurnEnd('forge', 'ok');
      clock.restore();
    }
  });
});

describe('app.boot trace', () => {
  it('root + child phases share one traceId; children nest under app.boot', () => {
    beginAppBoot();
    appBootSpan('app.boot.store', () => 1);
    appBootSpan('app.boot.shell', () => 2);
    endAppBoot();
    const root = finals('app.boot')[0]!;
    const store = finals('app.boot.store')[0]!;
    const shell = finals('app.boot.shell')[0]!;
    expect(root.parentSpanId).toBeUndefined();
    expect(store.traceId).toBe(root.traceId);
    expect(shell.traceId).toBe(root.traceId);
    expect(store.parentSpanId).toBe(root.spanId);
    expect(shell.parentSpanId).toBe(root.spanId);
  });

  it('appBootSpan returns the fn result; idempotent begin', () => {
    beginAppBoot();
    beginAppBoot(); // 幂等,不重起
    expect(appBootSpan('x', () => 42)).toBe(42);
    endAppBoot();
    expect(finals('app.boot').length).toBe(1);
  });
});
