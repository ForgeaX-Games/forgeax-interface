import '../../lib/telemetry-test-prelude';
import React from 'react';
import { act, render } from '@testing-library/react';
import { createAppHost, HostProvider } from '../../core/app-shell';
import { useShellStore } from '../../store';
import {
  PASSIVE_FEEDBACK_EVENT,
  PASSIVE_FEEDBACK_RECOVERED_EVENT,
} from '../../lib/passive-feedback';
import { PassiveFeedbackHost } from './PassiveFeedback';

describe('PassiveFeedbackHost agent recovery', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main class="chat-panel"><div class="composer"><button type="button">Send</button></div></main>';
    sessionStorage.removeItem('forgeax.feedback.passive.seen');
    useShellStore.setState({ chatpanelCollapsed: false });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('removes a scoped stale card while preserving the single composer Send action', async () => {
    const { host, control } = createAppHost();
    const view = render(
      <HostProvider value={host}>
        <PassiveFeedbackHost />
      </HostProvider>,
    );
    try {
      await act(async () => {
        window.dispatchEvent(new CustomEvent(PASSIVE_FEEDBACK_EVENT, {
          detail: {
            code: 'ui.stall',
            message: 'Agent did not respond after 600 seconds',
            scope: { sid: 'sid-ui', agentId: 'forge' },
          },
        }));
      });
      await act(async () => {});

      expect(document.querySelectorAll('.feedback-passive-card')).toHaveLength(1);
      expect(document.querySelectorAll('.composer button')).toHaveLength(1);
      expect(document.querySelectorAll('.feedback-passive-primary')).toHaveLength(1);

      await act(async () => {
        window.dispatchEvent(new CustomEvent(PASSIVE_FEEDBACK_RECOVERED_EVENT, {
          detail: { exceptionKey: 'agent-unresponsive', scope: { sid: 'sid-ui', agentId: 'forge' } },
        }));
      });

      expect(document.querySelectorAll('.feedback-passive-card')).toHaveLength(0);
      expect(document.querySelectorAll('.composer button')).toHaveLength(1);
    } finally {
      view.unmount();
      await control.dispose();
    }
  });

  it('does not dismiss another agent or session when a recovery is scoped', async () => {
    const { host, control } = createAppHost();
    const view = render(
      <HostProvider value={host}>
        <PassiveFeedbackHost />
      </HostProvider>,
    );
    try {
      await act(async () => {
        window.dispatchEvent(new CustomEvent(PASSIVE_FEEDBACK_EVENT, {
          detail: { code: 'ui.stall', message: 'sid-a', scope: { sid: 'sid-a', agentId: 'forge' } },
        }));
        window.dispatchEvent(new CustomEvent(PASSIVE_FEEDBACK_EVENT, {
          detail: { code: 'ui.stall', message: 'sid-b', scope: { sid: 'sid-b', agentId: 'forge' } },
        }));
      });
      await act(async () => {});
      // The host intentionally shows one card at a time, but both incidents
      // remain queued; resolving sid-a must reveal sid-b rather than clear all.
      expect(document.querySelector('.feedback-passive-summary')?.textContent).toBe('sid-a');

      await act(async () => {
        window.dispatchEvent(new CustomEvent(PASSIVE_FEEDBACK_RECOVERED_EVENT, {
          detail: { exceptionKey: 'agent-unresponsive', scope: { sid: 'sid-a', agentId: 'forge' } },
        }));
      });
      expect(document.querySelector('.feedback-passive-summary')?.textContent).toBe('sid-b');
    } finally {
      view.unmount();
      await control.dispose();
    }
  });
});
