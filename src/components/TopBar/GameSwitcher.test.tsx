import { describe, expect, it, mock } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import { activateGameFromModal, createSessionForGame, ProjectSessionRows } from './GameSwitcher';

describe('project row session creation', () => {
  it('renders a + instead of file count and routes only that click to session creation', () => {
    const picked = mock(() => undefined);
    const created = mock(() => undefined);
    const deleted = mock(() => undefined);
    const view = render(
      <ProjectSessionRows
        games={[{ slug: 'project-a', name: 'Project A', fileCount: 42, mtime: 1 }]}
        currentSlug={null}
        onPick={picked}
        onNewSession={created}
        onDelete={deleted}
        labels={{
          empty: 'empty',
          switchTo: (slug) => `switch ${slug}`,
          newSession: (slug) => `new session ${slug}`,
          delete: 'delete',
          meta: () => 'recent',
        }}
      />,
    );

    expect(view.queryByText('42')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'new session project-a' }));
    expect(created).toHaveBeenCalledWith('project-a');
    expect(picked).not.toHaveBeenCalled();
    expect(deleted).not.toHaveBeenCalled();
  });

  it('activates the clicked project before creating a scoped session', async () => {
    const calls: string[] = [];
    const setActiveGame = mock(async (slug: string) => { calls.push(`activate:${slug}`); });
    const createNewSession = mock(async (options: { readonly scope: string }) => {
      calls.push(`create:${options.scope}`);
      return { sid: 'session-a' };
    });

    await expect(createSessionForGame('project-a', { setActiveGame, createNewSession }))
      .resolves.toBe(true);
    expect(calls).toEqual(['activate:project-a', 'create:project-a']);
    expect(createNewSession).toHaveBeenCalledWith({ scope: 'project-a' });
  });

  it('reports an unsuccessful create so the caller keeps the project modal open', async () => {
    const setActiveGame = mock(async () => undefined);
    const createNewSession = mock(async () => null);

    await expect(createSessionForGame('project-a', { setActiveGame, createNewSession }))
      .resolves.toBe(false);
  });

  it('closes the modal only after the active-game mutation commits', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const close = mock(() => undefined);
    const switching = activateGameFromModal('project-a', {
      setActiveGame: async () => pending,
      close,
    });

    expect(close).not.toHaveBeenCalled();
    release();
    await switching;
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal open when activation fails', async () => {
    const close = mock(() => undefined);
    await expect(activateGameFromModal('project-a', {
      setActiveGame: async () => { throw new Error('runtime bind failed'); },
      close,
    })).rejects.toThrow('runtime bind failed');
    expect(close).not.toHaveBeenCalled();
  });

  it('disables every row action while a game switch is in flight', () => {
    const view = render(
      <ProjectSessionRows
        games={[{ slug: 'project-a', name: 'Project A', fileCount: 42, mtime: 1 }]}
        currentSlug={null}
        busySlug="project-a"
        onPick={() => undefined}
        onNewSession={() => undefined}
        onDelete={() => undefined}
        labels={{
          empty: 'empty',
          switchTo: (slug) => `switch ${slug}`,
          newSession: (slug) => `new session ${slug}`,
          delete: 'delete',
          meta: () => 'recent',
        }}
      />,
    );

    expect([...view.container.querySelectorAll('button')]
      .every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(view.container.querySelector('[title="switch project-a"]')
      ?.closest('[aria-busy="true"]')).not.toBeNull();
  });
});
