import { describe, expect, it } from 'bun:test';
import {
  dropPermissionSession,
  getResolvedPermission,
  isAskUserToolName,
  replayPermissionEvents,
} from './permission-stream';

describe('permission-stream replay', () => {
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
