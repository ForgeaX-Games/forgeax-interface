import { describe, expect, it } from 'bun:test';
import {
  appendComposerText,
  appendComposerTextOnce,
  enqueueComposerTextRequest,
  type ComposerTextBridgeState,
} from './composer-bridge';

describe('appendComposerTextOnce', () => {
  it('appends a new suggestion', () => {
    expect(appendComposerTextOnce('Existing draft', 'Try the next step')).toBe(
      'Existing draft\nTry the next step',
    );
  });

  it('does not append the same suggestion twice', () => {
    expect(appendComposerTextOnce('Try the next step', 'Try the next step')).toBe(
      'Try the next step',
    );
    expect(appendComposerTextOnce('Try the next step\nTry the next step', 'Try the next step')).toBe(
      'Try the next step\nTry the next step',
    );
  });

  it('matches line endings and surrounding whitespace for deduplication', () => {
    expect(appendComposerTextOnce('Existing\r\nTry the next step\n', '  Try the next step  ')).toBe(
      'Existing\r\nTry the next step\n',
    );
  });

  it('still appends a different suggestion', () => {
    expect(appendComposerTextOnce('Try the next step', 'Run the test suite')).toBe(
      'Try the next step\nRun the test suite',
    );
  });

  it('allows an intentional A to B to A sequence when the bridge has distinct recommendation ids', () => {
    const afterTwo = appendComposerText(
      appendComposerText('', 'Try the next step'),
      'Run the test suite',
    );
    expect(appendComposerText(afterTwo, 'Try the next step')).toBe(
      'Try the next step\nRun the test suite\nTry the next step',
    );
  });

  it('ignores a repeated recommendation click in one revision but preserves A to B to A', () => {
    const initial: ComposerTextBridgeState = {
      pendingText: null,
      textQueue: [],
      composerRevision: 0,
      lastRecommendationId: null,
      seenRecommendations: {},
    };
    const request = (state: ComposerTextBridgeState, text: string, id: string) =>
      enqueueComposerTextRequest(state, { text, mode: 'append', recommendationId: id });
    const consume = (state: ComposerTextBridgeState): ComposerTextBridgeState => ({
      ...state,
      pendingText: null,
      textQueue: [],
    });

    const first = request(initial, 'A', 'artifact:0');
    expect(request(first, 'A', 'artifact:0')).toBe(first);
    const second = request(consume(first), 'B', 'artifact:1');
    const third = request(consume(second), 'A', 'artifact:0');

    expect([first.pendingText?.text, second.pendingText?.text, third.pendingText?.text]).toEqual(['A', 'B', 'A']);
    expect(third.composerRevision).toBe(3);
  });
});
