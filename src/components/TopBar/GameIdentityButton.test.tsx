import { afterEach, describe, expect, it } from 'bun:test';
import { act, fireEvent, render } from '@testing-library/react';
import { HostProvider } from '../../core/app-shell';
import { createAppHost } from '../../core/app-shell/host';
import { useShellStore } from '../../store';
import { ActiveGameWindowTitle, GameIdentityButton } from './GameIdentityButton';
import { configureStudioDomainClients, __resetStudioDomainClientsForTests, type StudioProjectClient } from '../../store-parts/domain-clients';
import { warmRecentGames } from '../../lib/recent-games';

const initialState = useShellStore.getState();

function renderIdentity(onOpen?: () => void) {
  const { host } = createAppHost();
  host.commands.register({
    id: 'game.open',
    execute: () => { onOpen?.(); return { status: 'completed' as const }; },
  });
  return render(
    <HostProvider value={host}>
      <ActiveGameWindowTitle />
      <GameIdentityButton />
    </HostProvider>,
  );
}

afterEach(() => {
  useShellStore.setState(initialState, true);
  document.title = '';
  __resetStudioDomainClientsForTests();
});

describe('GameIdentityButton', () => {
  it('shows the empty label when no game is open', () => {
    useShellStore.setState({ activeGameSlug: null, activeGameRuntime: { status: 'unbound' } });
    const view = renderIdentity();
    expect(view.getByTestId('game-identity').textContent).toContain('No game open');
    expect(view.getByTestId('game-identity').getAttribute('data-game-slug')).toBe('');
  });

  it('updates the label immediately when the store slug changes', () => {
    useShellStore.setState({ activeGameSlug: 'alpha', activeGameRuntime: { status: 'ready' } });
    const view = renderIdentity();
    expect(view.getByTestId('game-identity').textContent).toContain('alpha');
    expect(document.title).toContain('alpha');

    act(() => {
      useShellStore.setState({ activeGameSlug: 'beta', activeGameRuntime: { status: 'transitioning' } });
    });

    expect(view.getByTestId('game-identity').textContent).toContain('beta');
    expect(view.getByTestId('game-identity').getAttribute('data-game-slug')).toBe('beta');
    expect(view.getByTestId('game-identity').getAttribute('aria-busy')).toBe('true');
    expect(document.title).toContain('beta');
  });

  it('prefers the cached display name over the slug', async () => {
    configureStudioDomainClients({
      agents: null as never,
      builds: null as never,
      projects: {
        listProjects: async () => ({
          games: [{ slug: 'arena', name: 'Arena Royale' }],
          activeSlug: 'arena',
        }),
      } as StudioProjectClient,
    });
    await warmRecentGames();
    useShellStore.setState({ activeGameSlug: 'arena', activeGameRuntime: { status: 'ready' } });
    const view = renderIdentity();
    expect(view.getByTestId('game-identity').textContent).toContain('Arena Royale');
    expect(document.title).toContain('Arena Royale');
  });

  it('opens the existing game list through game.open', () => {
    let opened = 0;
    useShellStore.setState({ activeGameSlug: 'arena', activeGameRuntime: { status: 'ready' } });
    const view = renderIdentity(() => { opened += 1; });
    fireEvent.click(view.getByTestId('game-identity'));
    expect(opened).toBe(1);
  });
});
