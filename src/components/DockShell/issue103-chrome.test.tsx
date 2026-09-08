import { afterEach, expect, it } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DockviewApi } from 'dockview';
import { HostProvider } from '../../core/app-shell';
import { mockHost } from '../../test-utils/mockHost';
import { PanelRenderersProvider } from './panelRenderers';
import { BASE_PANEL_COMPONENTS } from './panelRegistry';
import { LayoutControl } from './DockRegion';
import { isDockTitleHidden } from './dockTitle';
import { isFooterPanelUserVisible, setFooterPanelUserVisible } from './footer-panel-visibility';

afterEach(cleanup);

it('removes the Viewport corner control while retaining its content', () => {
  const Viewport = BASE_PANEL_COMPONENTS.viewport!;
  const { container } = render(
    <HostProvider value={mockHost()}>
      <PanelRenderersProvider value={{ editorPanelIds: [], panels: {
        viewport: { title: 'Viewport', dockChrome: { singleTab: 'hideTitle' }, render: () => <div>Viewport content</div> },
      } }}>
        <Viewport {...{} as any} />
      </PanelRenderersProvider>
    </HostProvider>,
  );
  expect(screen.getByText('Viewport content')).toBeTruthy();
  expect(container.querySelector('[data-testid="dock-title-restore"]')).toBeNull();
});

it('restores and hides the Viewport title from the existing Layout menu without closing the panel', () => {
  const host = mockHost();
  const group = document.createElement('div');
  group.innerHTML = '<section data-dock-single-tab="hideTitle"></section>';
  let closes = 0;
  const panel = { group: { element: group, panels: [{}] }, api: { location: { type: 'grid' }, close: () => { closes++; } } };
  render(<HostProvider value={host}>
    <LayoutControl getApi={() => ({ getPanel: () => panel }) as unknown as DockviewApi}
      revision={0} panels={[{ id: 'viewport', title: 'Viewport' }]} onReopen={() => { throw new Error('must not reopen'); }} />
  </HostProvider>);
  act(() => host.bus.emit('dock:layout-toggle', {}));
  fireEvent.click(screen.getByRole('button', { name: /Show panel title.*Viewport/i }));
  expect(isDockTitleHidden(group)).toBe(false);
  expect(screen.queryByRole('menu')).toBeNull();
  act(() => host.bus.emit('dock:layout-toggle', {}));
  fireEvent.click(screen.getByRole('button', { name: /Hide panel title.*Viewport/i }));
  expect(isDockTitleHidden(group)).toBe(true);
  expect(closes).toBe(0);
});

for (const [name, count, location] of [
  ['multi-panel group', 2, { type: 'grid' }],
  ['side drawer', 1, { type: 'edge', position: 'left' }],
] as const) {
  it(`does not offer a nonfunctional title toggle for a ${name}`, () => {
    const host = mockHost();
    const panel = { group: { element: document.createElement('div'), panels: Array(count).fill({}) }, api: { location } };
    render(<HostProvider value={host}>
      <LayoutControl getApi={() => ({ getPanel: () => panel }) as unknown as DockviewApi}
        revision={0} panels={[{ id: 'viewport', title: 'Viewport' }]} onReopen={() => {}} />
    </HostProvider>);
    act(() => host.bus.emit('dock:layout-toggle', {}));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /panel title/i })).toBeNull();
  });
}


it('preserves footer visibility intent while the Viewport title toggle shares Layout', () => {
  const host = mockHost();
  const group = document.createElement('div');
  group.innerHTML = '<section data-dock-single-tab="hideTitle"></section>';
  let closes = 0;
  const viewport = { group: { element: group, panels: [{}] }, api: { location: { type: 'grid' } } };
  const footer = { api: { close: () => { closes++; } } };
  setFooterPanelUserVisible('info', false);
  try {
    render(<HostProvider value={host}>
      <LayoutControl getApi={() => ({ getPanel: (id: string) => id === 'viewport' ? viewport : footer }) as unknown as DockviewApi}
        revision={0} panels={[{ id: 'viewport', title: 'Viewport' }, { id: 'info', title: 'Info' }]}
        onReopen={(id) => setFooterPanelUserVisible(id, true)} />
    </HostProvider>);
    act(() => host.bus.emit('dock:layout-toggle', {}));
    const info = screen.getByRole('button', { name: /Info/ });
    expect(info.classList.contains('on')).toBe(false);
    fireEvent.click(info);
    expect(isFooterPanelUserVisible('info')).toBe(true);
    expect(info.classList.contains('on')).toBe(true);
    fireEvent.click(info);
    expect(isFooterPanelUserVisible('info')).toBe(false);
    expect(closes).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /Show panel title.*Viewport/i }));
    expect(isDockTitleHidden(group)).toBe(false);
    expect(isFooterPanelUserVisible('info')).toBe(false);
  } finally {
    setFooterPanelUserVisible('info', true);
  }
});
