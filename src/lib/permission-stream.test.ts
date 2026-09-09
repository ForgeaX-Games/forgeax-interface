import { describe, expect, it } from 'bun:test';
import {
  dropPermissionSession,
  getResolvedPermission,
  getPendingPermission,
  isAskUserToolName,
  replayPermissionEvents,
  clearPendingPermission,
} from './permission-stream';

describe('permission-stream replay', () => {
  it('preserves approval context through replay without coercing invalid reasons', () => {
    const sid = 'permission-context-test';
    const payload = {
      reqId: 'context-1', toolName: 'write_file', command: '', agent: 'suzu',
      capability: 'write', reason: 'Confirm write in active game directory',
      input: { path: 'docs/design.md' }, canRemember: true,
    };
    replayPermissionEvents(sid, [{ type: 'permission:request', payload }]);
    expect(getPendingPermission(sid)).toEqual(payload);
    replayPermissionEvents(sid, [{ type: 'permission:request', payload: { ...payload, reason: { secret: 'not display text' } } }]);
    expect(getPendingPermission(sid)?.reason).toBeUndefined();
    dropPermissionSession(sid);
    expect(getPendingPermission(sid)).toBeNull();
  });

  it('recognizes canonical and namespaced AskUserQuestion tool names', () => {
    expect(isAskUserToolName('AskUserQuestion')).toBe(true);
    expect(isAskUserToolName('mcp__fxt__AskUserQuestion')).toBe(true);
    expect(isAskUserToolName('ask_user')).toBe(true);
    expect(isAskUserToolName('write_file')).toBe(false);
  });

  it('keeps structured multi-select values in the resolved summary', () => {
    const sid = 'permission-replay-test';
    replayPermissionEvents(sid, [
      {
        type: 'permission:request',
        payload: {
          reqId: 'req-1',
          toolName: 'AskUserQuestion',
          input: {
            questions: [
              { question: 'Focus', options: [{ label: 'Combat' }, { label: 'Puzzle' }] },
              { question: 'Mode', options: [{ label: 'Story' }] },
            ],
          },
        },
      },
      {
        type: 'permission:resolved',
        payload: {
          reqId: 'req-1',
          toolName: 'AskUserQuestion',
          answerValues: { Focus: ['Combat', 'Puzzle'], Mode: ['Story'] },
        },
      },
    ]);

    expect(getResolvedPermission(sid)).toEqual({
      sid,
      reqId: 'req-1',
      toolName: 'AskUserQuestion',
      questions: [
        { question: 'Focus', values: ['Combat', 'Puzzle'] },
        { question: 'Mode', values: ['Story'] },
      ],
    });
    dropPermissionSession(sid);
  });
});

describe('concurrent permission queue', () => {
  const request = (reqId: string, agent = 'suzu') => ({ type: 'permission:request', payload: { reqId, agent, toolName: 'write_file' } });
  const resolved = (reqId: string) => ({ type: 'permission:resolved', payload: { reqId, allow: false } });

  it('keeps the first request visible and drains only the answered request', () => {
    const sid = 'fifo';
    replayPermissionEvents(sid, [request('audio', 'audio-designer'), request('suzu'), request('iro', 'iro')]);
    expect(getPendingPermission(sid)?.reqId).toBe('audio');
    clearPendingPermission(sid, 'audio');
    expect(getPendingPermission(sid)?.reqId).toBe('suzu');
    replayPermissionEvents(sid, [resolved('audio')]);
    expect(getPendingPermission(sid)?.reqId).toBe('suzu');
    clearPendingPermission(sid, 'suzu');
    expect(getPendingPermission(sid)?.reqId).toBe('iro');
    replayPermissionEvents(sid, [resolved('iro')]);
    expect(getPendingPermission(sid)).toBeNull();
    dropPermissionSession(sid);
  });

  it('handles out-of-order resolution and duplicate replay without reviving settled requests', () => {
    const sid = 'replay-queue';
    replayPermissionEvents(sid, [request('one'), request('two'), request('one'), resolved('two')]);
    expect(getPendingPermission(sid)?.reqId).toBe('one');
    clearPendingPermission(sid, 'one');
    replayPermissionEvents(sid, [request('one'), request('two')]);
    expect(getPendingPermission(sid)).toBeNull();
    dropPermissionSession(sid);
  });

  it('isolates sessions and clears both pending and resolved state on close', () => {
    const ask = { type: 'permission:resolved', payload: { reqId: 'answer', toolName: 'ask_user', input: { questions: [{ question: 'Q' }] }, answers: { Q: 'A' } } };
    replayPermissionEvents('one-session', [ask, request('pending')]);
    replayPermissionEvents('one-session', [ask]);
    replayPermissionEvents('two-session', [request('pending')]);
    dropPermissionSession('one-session');
    expect(getPendingPermission('one-session')).toBeNull();
    expect(getResolvedPermission('one-session')).toBeNull();
    expect(getPendingPermission('two-session')?.reqId).toBe('pending');
    dropPermissionSession('two-session');
  });
});
