import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { getDockRegions } from '@forgeax/app-shell/dock';
import { HostProvider } from '../../core/app-shell';
import { useShellStore } from '../../store';
import { mockHost } from '../../test-utils/mockHost';
import { PanelRenderersProvider, type PanelRenderers } from './panelRenderers';
import { DockRegion } from './DockRegion';

const initialState = useShellStore.getState();

afterEach(() => {
  cleanup();
  useShellStore.setState(initialState, true);
});

describe('DockRegion ChatDock session chrome', () => {
  it('mounts one session switcher above the chat dockview', async () => {
    useShellStore.setState({
      tabs: [{
        sid: 'session-one',
        displayName: 'Main chat',
        agentId: null,
        providerOverride: null,
        lastActivityAt: 10,
      }],
      activeSid: 'session-one',
      activeGameSlug: 'test-game',
    });

    const renderers: PanelRenderers = {
      editorPanelIds: [],
      panels: {
        chat: { title: 'Chat', render: () => <div>chat-body</div> },
      },
    };

    await act(async () => {
      render(
        <HostProvider value={mockHost()}>
          <PanelRenderersProvider value={renderers}>
            <DockRegion region="ChatDock" />
          </PanelRenderersProvider>
        </HostProvider>,
      );
    });

    const sessionTabs = screen.getByTestId('chat-session-tabs');
    const chatDockInner = sessionTabs.closest('.fx-chatdock-inner');
    const dockviews = document.querySelectorAll('.fx-dockshell');

    expect(document.querySelectorAll('[data-testid="chat-session-tabs"]')).toHaveLength(1);
    expect(document.querySelectorAll('.fx-chatdock-inner')).toHaveLength(1);
    expect(dockviews).toHaveLength(1);
    expect(chatDockInner?.children).toHaveLength(2);
    expect(chatDockInner?.children[0]).toBe(sessionTabs);
    expect(chatDockInner?.children[1]?.contains(dockviews[0]!)).toBe(true);
    expect(screen.getByRole('tab', { name: 'Main chat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeTruthy();
  });

  it('keeps the replayed Dockview ready session registered under StrictMode', async () => {
    const renderers: PanelRenderers = {
      editorPanelIds: [],
      panels: { chat: { title: 'Chat', render: () => <div>chat-body</div> } },
    };

    await act(async () => {
      render(
        <StrictMode>
          <HostProvider value={mockHost()}>
            <PanelRenderersProvider value={renderers}>
              <DockRegion region="ChatDock" />
            </PanelRenderersProvider>
          </HostProvider>
        </StrictMode>,
      );
    });

    expect(getDockRegions().filter(({ region }) => region === 'ChatDock')).toHaveLength(1);
  });
});
