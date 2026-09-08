import { describe, expect, test } from 'bun:test';
import {
  createPassiveFeedbackClassifier,
  matchesPassiveFeedbackScope,
} from './passive-feedback';

describe('passive feedback classifier', () => {
  test('routes blocking editor failures to the centered recovery card', () => {
    const classifier = createPassiveFeedbackClassifier();
    expect(classifier.ingest({ code: 'save-write-failed', message: 'save-write-failed: disk rejected' }))
      .toMatchObject({ exceptionKey: 'save-failure', placement: 'center', recovery: { kind: 'command', commandId: 'editor.save' } });
    expect(classifier.ingest({ code: 'device-lost', message: 'GPU device lost' }))
      .toMatchObject({ exceptionKey: 'gpu-device-lost', placement: 'center', recovery: { kind: 'command', commandId: 'editor.restartPreview' } });
    expect(classifier.ingest({ code: 'renderer-process-terminated', message: 'carrier stopped' }))
      .toMatchObject({ exceptionKey: 'renderer-crash', placement: 'center', recovery: { kind: 'command', commandId: 'editor.restartPreview' } });
    expect(classifier.ingest({ code: 'app-system-update-failed', message: 'game update threw' }))
      .toMatchObject({ exceptionKey: 'renderer-crash', placement: 'center' });
    expect(classifier.ingest({ code: 'viewport-runtime-disconnected', message: 'runtime unreachable' }))
      .toMatchObject({ exceptionKey: 'runtime-disconnected', placement: 'center', recovery: { kind: 'command', commandId: 'editor.restartPreview' } });
  });

  test('routes agent stalls to the composer and recovered main-thread stalls to the corner', () => {
    const classifier = createPassiveFeedbackClassifier();
    expect(classifier.ingest({ code: 'ui.stall', message: 'No first token after 30 seconds' }))
      .toMatchObject({ exceptionKey: 'agent-unresponsive', placement: 'chat' });
    expect(classifier.ingest({ code: 'main-thread-stall', message: 'Main thread paused for 8 seconds' }))
      .toMatchObject({ exceptionKey: 'main-thread-stall', placement: 'corner', recovery: { kind: 'none' } });
  });

  test('keeps agent recovery scoped so one session or agent cannot dismiss another card', () => {
    const classifier = createPassiveFeedbackClassifier();
    const incident = classifier.ingest({
      code: 'ui.stall',
      message: 'No first token after 600 seconds',
      scope: { sid: 'sid-a', agentId: 'forge' },
    });
    expect(incident).toMatchObject({ scope: { sid: 'sid-a', agentId: 'forge' } });
    expect(matchesPassiveFeedbackScope(incident?.scope, { sid: 'sid-a', agentId: 'forge' })).toBe(true);
    expect(matchesPassiveFeedbackScope(incident?.scope, { sid: 'sid-a', agentId: 'iori' })).toBe(false);
    expect(matchesPassiveFeedbackScope(incident?.scope, { sid: 'sid-b', agentId: 'forge' })).toBe(false);
    expect(matchesPassiveFeedbackScope(incident?.scope, undefined)).toBe(true);
  });

  test('asks only after repeated uncaught or build errors cross their short-window threshold', () => {
    const classifier = createPassiveFeedbackClassifier();
    expect(classifier.ingest({ code: 'window-error', message: 'boom 1', ts: 1_000 })).toBeNull();
    expect(classifier.ingest({ code: 'window-error', message: 'boom 2', ts: 2_000 })).toBeNull();
    expect(classifier.ingest({ code: 'unhandled-rejection', message: 'boom 3', ts: 3_000 }))
      .toMatchObject({ exceptionKey: 'uncaught-errors', placement: 'corner' });

    expect(classifier.ingest({ code: 'vite:error', message: 'build 1', ts: 40_000 })).toBeNull();
    expect(classifier.ingest({ code: 'vite:error', message: 'build 2', ts: 45_000 })).toBeNull();
    expect(classifier.ingest({ code: 'vite:error', message: 'build 3', ts: 50_000 }))
      .toMatchObject({ exceptionKey: 'build-failures', placement: 'corner', recovery: { kind: 'command', commandId: 'editor.restartPreview' } });
  });

  test('does not interrupt for unclassified warnings and keeps a multiline stack', () => {
    const classifier = createPassiveFeedbackClassifier();
    expect(classifier.ingest({ code: 'console-warn', message: 'automatic retry in progress' })).toBeNull();
    expect(classifier.ingest({ code: 'play-bootstrap-failed', message: 'Play failed\n at bootstrap (play.ts:4)' }))
      .toMatchObject({ summary: 'Play failed', stack: 'Play failed\nat bootstrap (play.ts:4)' });
  });

  test('accepts concrete production save, Play, renderer, runtime, and Vite code families', () => {
    const classifier = createPassiveFeedbackClassifier();
    expect(classifier.ingest({ code: 'save-host-write-failed', message: 'write denied' }))
      .toMatchObject({ exceptionKey: 'save-failure' });
    expect(classifier.ingest({ code: 'play-carrier-boot-failed', message: 'carrier boot failed' }))
      .toMatchObject({ exceptionKey: 'play-failure' });
    expect(classifier.ingest({ code: 'renderer-surface-unavailable', message: 'surface gone' }))
      .toMatchObject({ exceptionKey: 'renderer-crash' });
    expect(classifier.ingest({ code: 'runtime-host-unreachable', message: 'host gone' }))
      .toMatchObject({ exceptionKey: 'runtime-disconnected' });
    expect(classifier.ingest({ code: 'vag-console', message: '[vite build] failed 1', ts: 1_000 })).toBeNull();
    expect(classifier.ingest({ code: 'vag-console', message: '[vite build] failed 2', ts: 2_000 })).toBeNull();
    expect(classifier.ingest({ code: 'vag-console', message: '[vite build] failed 3', ts: 3_000 }))
      .toMatchObject({ exceptionKey: 'build-failures' });
  });

  test('marks exactly the detector-driven incidents as corner placement', () => {
    // Requirements §4 scopes "同一异常类型同一会话只询问一次" to the corner card,
    // because those sources are polling detectors. PassiveFeedbackHost keys its
    // session-once dedupe off `placement === 'corner'`, so this mapping is the
    // contract that decides which incidents may be muted for a whole session.
    const classifier = createPassiveFeedbackClassifier();
    const placementOf = (code: string, message = code, ts?: number) =>
      classifier.ingest(ts === undefined ? { code, message } : { code, message, ts })?.placement;

    // Per-attempt user-visible failures — must never be session-muted.
    expect(placementOf('save-write-failed')).toBe('center');
    expect(placementOf('play-bootstrap-failed')).toBe('center');
    expect(placementOf('device-lost')).toBe('center');
    expect(placementOf('renderer-process-terminated')).toBe('center');
    expect(placementOf('viewport-runtime-disconnected')).toBe('center');
    expect(placementOf('agent_crash')).toBe('chat');

    // Detector-driven — these are the ones the session-once rule targets.
    expect(placementOf('main-thread-stall')).toBe('corner');
  });
});
