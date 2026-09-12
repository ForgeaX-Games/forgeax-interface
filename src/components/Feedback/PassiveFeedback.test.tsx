import '../../lib/telemetry-test-prelude';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { act, render } from '@testing-library/react';
import { createAppHost, HostProvider } from '../../core/app-shell';
import { useShellStore } from '../../store';
import {
  PASSIVE_FEEDBACK_EVENT,
  PASSIVE_FEEDBACK_RECOVERED_EVENT,
} from '../../lib/passive-feedback';
import { PassiveFeedbackHost } from './PassiveFeedback';
import { setLocale } from '../../i18n';
import { useFeedbackStore } from './store';

describe('PassiveFeedbackHost agent recovery', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main class="chat-panel"><div class="composer"><button type="button">Send</button></div></main>';
    sessionStorage.removeItem('forgeax.feedback.passive.seen');
    useShellStore.setState({ chatpanelCollapsed: false });
    setLocale('en', { persist: false });
  });

  afterEach(() => {
    setLocale('en', { persist: false });
    document.body.innerHTML = '';
  });

  it('shows a compact, dismissible main-thread notice above the composer only once', async () => {
    const { host, control } = createAppHost();
    const view = render(<HostProvider value={host}><PassiveFeedbackHost /></HostProvider>);
    const report = async () => {
      await act(async () => {
        window.dispatchEvent(new CustomEvent(PASSIVE_FEEDBACK_EVENT, {
          detail: { code: 'main-thread-stall', message: 'Main thread was unresponsive for 6 seconds', durationMs: 6000 },
        }));
      });
    };
    try {
      await report();
      const slot = document.querySelector('.feedback-passive-chat-slot');
      expect(slot?.nextElementSibling?.classList.contains('composer')).toBe(true);
      const card = slot?.querySelector('.feedback-passive-card');
      expect(card?.classList.contains('feedback-passive-card--compact')).toBe(true);
      expect(card?.classList.contains('feedback-passive-card--corner')).toBe(false);
      const disclosure = card?.querySelector<HTMLDetailsElement>('details');
      expect(disclosure?.open).toBe(false);
      expect(disclosure?.querySelector('summary')?.textContent).toContain('6 seconds');
      await act(async () => { setLocale('zh', { persist: false }); });
      expect(disclosure?.querySelector('summary')?.textContent).toContain('刚才界面短暂卡顿');
      expect(disclosure?.querySelector('summary')?.textContent).toContain('6 秒');
      expect(card?.querySelector('.feedback-passive-primary')?.textContent).toBe('发送反馈');
      expect(document.querySelector('[aria-modal="true"]')).toBeNull();
      await act(async () => { if (disclosure) disclosure.open = true; });
      expect(disclosure?.open).toBe(true);
      expect(card?.querySelector('.feedback-passive-summary')?.textContent).not.toContain('Main thread was unresponsive');
      await act(async () => { card?.querySelector<HTMLButtonElement>('.feedback-passive-close')?.click(); });
      expect(document.querySelector('.feedback-passive-card')).toBeNull();
      await report();
      expect(document.querySelector('.feedback-passive-card')).toBeNull();
      expect(document.querySelectorAll('.composer button')).toHaveLength(1);
    } finally {
      view.unmount();
      await control.dispose();
    }
  });

  it('keeps a compact fallback without a composer, then attaches when the composer mounts', async () => {
    document.body.innerHTML = '';
    const { host, control } = createAppHost();
    const view = render(<HostProvider value={host}><PassiveFeedbackHost /></HostProvider>);
    try {
      await act(async () => {
        window.dispatchEvent(new CustomEvent(PASSIVE_FEEDBACK_EVENT, {
          detail: { code: 'main-thread-stall', message: 'Legacy stall without duration metadata' },
        }));
      });
      expect(document.querySelector('.feedback-passive-card--compact.feedback-passive-card--corner')).not.toBeNull();
      expect(document.querySelector<HTMLDetailsElement>('.feedback-passive-disclosure')?.open).toBe(false);
      expect(document.querySelector('.feedback-passive-duration')).toBeNull();
      await act(async () => {
        const panel = document.createElement('main');
        panel.className = 'chat-panel';
        panel.innerHTML = '<div class="composer"></div>';
        document.body.append(panel);
      });
      expect(document.querySelector('.feedback-passive-chat-slot .feedback-passive-card--compact')).not.toBeNull();
      expect(document.querySelector('.feedback-passive-card--corner')).toBeNull();
      await act(async () => { document.querySelector<HTMLButtonElement>('.feedback-passive-ignore')?.click(); });
      expect(document.querySelector('.feedback-passive-card')).toBeNull();
    } finally {
      view.unmount();
      await control.dispose();
    }
  });

  it('keeps the original diagnostic when sending feedback from the compact notice', async () => {
    const { host, control } = createAppHost();
    const submit = spyOn(useFeedbackStore.getState(), 'submitAuto').mockResolvedValue(undefined);
    const view = render(<HostProvider value={host}><PassiveFeedbackHost /></HostProvider>);
    try {
      await act(async () => {
        window.dispatchEvent(new CustomEvent(PASSIVE_FEEDBACK_EVENT, {
          detail: { code: 'main-thread-stall', message: 'Main thread was unresponsive for 6 seconds', durationMs: 6000 },
        }));
      });
      await act(async () => {
        const disclosure = document.querySelector<HTMLDetailsElement>('.feedback-passive-disclosure');
        if (disclosure) disclosure.open = true;
        document.querySelector<HTMLButtonElement>('.feedback-passive-primary')?.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit).toHaveBeenCalledWith({
        exceptionKey: 'main-thread-stall',
        diagnostic: '[passive-feedback/main-thread-stall] Main thread was unresponsive for 6 seconds',
      });
      expect(document.querySelector('.feedback-passive-card')).toBeNull();
    } finally {
      submit.mockRestore();
      view.unmount();
      await control.dispose();
    }
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
      const disclosure = document.querySelector<HTMLDetailsElement>('.feedback-passive-disclosure');
      expect(disclosure).not.toBeNull();
      expect(disclosure?.open).toBe(false);
      expect(disclosure?.querySelector('summary')?.textContent).toBeTruthy();
      await act(async () => { if (disclosure) disclosure.open = true; });
      expect(disclosure?.open).toBe(true);
      expect(disclosure?.querySelector('.feedback-passive-summary')?.textContent).toContain('600 seconds');

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
