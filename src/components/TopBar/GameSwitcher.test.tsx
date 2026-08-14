import { describe, expect, it, mock } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import { createSessionForGame, ProjectSessionRows } from './GameSwitcher';

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
});
