import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HostProvider } from '../../core/app-shell';
import { mockHost } from '../../test-utils/mockHost';
import { PanelRenderersProvider, type PanelRenderers, type PanelDescriptor } from './panelRenderers';

const DEFAULT_RENDERERS: PanelRenderers = {
  editorPanelIds: [],
};

describe('DockPanelHost', () => {
  let host: HTMLDivElement;
  let root: Root;
  let registered = false;

  beforeEach(() => {
    try { GlobalRegistrator.register(); registered = true; } catch { registered = false; }
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    if (registered) GlobalRegistrator.unregister();
  });

  it('renders the body registered under the given panel id with a DockPanel:<id> marker', async () => {
    const { DockPanelHost } = await import('./DockPanelHost');
    const renderers: PanelRenderers = {
      ...DEFAULT_RENDERERS,
      panels: { chat: { title: 'Chat', render: () => <span>chat-body</span> } },
    };
    const hostApi = mockHost();
    act(() => {
      root.render(
        <HostProvider value={hostApi}>
          <PanelRenderersProvider value={renderers}>
            <DockPanelHost id="chat" />
          </PanelRenderersProvider>
        </HostProvider>,
      );
    });
    expect(host.textContent).toContain('chat-body');
    const marker = host.querySelector('[data-fx-slot="DockPanel:chat"]');
    expect(marker).not.toBeNull();
  });

  it('omits the empty Chat header requested by the product without hiding real actions', async () => {
    const { DockPanelHost } = await import('./DockPanelHost');
    const hostApi = mockHost();
    const show = (actions: NonNullable<PanelDescriptor['actions']> = [], showTitle = false) => act(() => root.render(
      <HostProvider value={hostApi}>
        <PanelRenderersProvider value={{ ...DEFAULT_RENDERERS, panels: { chat: {
          title: 'Chat', header: { visible: true, showTitle }, dockChrome: { singleTab: 'hideTitle' },
          actions, render: () => <span>chat-body</span>,
        } } }}>
          <DockPanelHost id="chat" />
        </PanelRenderersProvider>
      </HostProvider>,
    ));
    show();
    expect(host.querySelector('.fx-panel-header')).toBeNull();
    expect(host.textContent).toContain('chat-body');
    show([{ id: 'chat.action', panelId: 'chat', kind: 'command', title: 'Chat action', command: 'test.action' }]);
    expect(host.querySelector('.fx-panel-header')).not.toBeNull();
    expect(host.querySelector('[data-dock-single-tab="hideTitle"]')).not.toBeNull();
    show([], true);
    expect(host.querySelector('.fx-panel-header')?.textContent).toContain('Chat');
  });

  it('renders a placeholder when no body is registered for the id', async () => {
    const { DockPanelHost } = await import('./DockPanelHost');
    const hostApi = mockHost();
    act(() => {
      root.render(
        <HostProvider value={hostApi}>
          <PanelRenderersProvider value={DEFAULT_RENDERERS}>
            <DockPanelHost id="hierarchy" />
          </PanelRenderersProvider>
        </HostProvider>,
      );
    });
    // Marker still present (so the debug overlay shows the empty slot).
    expect(host.querySelector('[data-fx-slot="DockPanel:hierarchy"]')).not.toBeNull();
    // Placeholder body present.
    expect(host.textContent).toContain('Panel not mounted');
  });
});
