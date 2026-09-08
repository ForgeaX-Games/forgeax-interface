import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setLocale } from '@/i18n';
import { useShellStore, type AppState } from '../../store';
import { DialogHost } from '../../lib/dialog';
import { SessionTabStrip } from './SessionTabStrip';

const initialState = useShellStore.getState();

function installSessionState(overrides: Partial<AppState> = {}) {
  const switchToSession = mock(async () => undefined);
  const createNewSession = mock(async () => ({ sid: 'session-new' }));
  const refreshSessions = mock(async () => undefined);
  const closeSession = mock(async () => undefined);
  useShellStore.setState({
    tabs: [
      { sid: 'session-one', displayName: 'Main chat', agentId: null, providerOverride: null, lastActivityAt: 10 },
      { sid: 'session-two', displayName: 'Scene polish', agentId: null, providerOverride: null, lastActivityAt: 20 },
    ],
    activeSid: 'session-one',
    activeGameSlug: 'test-game',
    switchToSession,
    createNewSession,
    refreshSessions,
    closeSession,
    ...overrides,
  });
  return { switchToSession, createNewSession, refreshSessions, closeSession };
}

beforeEach(() => setLocale('en', { persist: false }));

afterEach(() => {
  cleanup();
  useShellStore.setState(initialState, true);
});

describe('SessionTabStrip', () => {
  it('renders one accessible tab per store session and switches through the store action', async () => {
    const actions = installSessionState();
    render(<SessionTabStrip />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('button', { name: /delete conversation/i })).toHaveLength(1);

    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Scene polish' })); });
    expect(actions.switchToSession).toHaveBeenCalledWith('session-two');
  });

  it('moves keyboard focus without starting an async session switch', () => {
    const actions = installSessionState();
    render(<SessionTabStrip />);

    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(tabs[1]);
    expect(actions.switchToSession).not.toHaveBeenCalled();
  });

  it('labels untitled sessions as New Session without leaking the session id', () => {
    installSessionState({
      tabs: [
        { sid: 'e7f57dabcdef', displayName: undefined, agentId: null, providerOverride: null, lastActivityAt: 10 },
      ],
      activeSid: 'e7f57dabcdef',
    });
    render(<SessionTabStrip />);

    expect(screen.getByRole('tab', { name: 'New Session' })).toBeTruthy();
    expect(screen.queryByText(/e7f57d/)).toBeNull();
    expect(screen.queryByText(/session /i)).toBeNull();
  });

  it('labels untitled sessions as 新对话 in Chinese', () => {
    setLocale('zh', { persist: false });
    installSessionState({
      tabs: [
        { sid: 'e7f57dabcdef', displayName: undefined, agentId: null, providerOverride: null, lastActivityAt: 10 },
      ],
      activeSid: 'e7f57dabcdef',
    });
    render(<SessionTabStrip />);

    expect(screen.getByRole('tab', { name: '新对话' })).toBeTruthy();
    expect(screen.queryByText(/e7f57d/)).toBeNull();
  });

  it('creates a project-scoped session from the pinned plus tool', async () => {
    const actions = installSessionState();
    render(<SessionTabStrip />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'New conversation' })); });
    expect(actions.createNewSession).toHaveBeenCalledWith({ scope: 'test-game' });
  });

  it('requires destructive confirmation before deleting the active session', async () => {
    const actions = installSessionState();
    render(<><SessionTabStrip /><DialogHost /></>);

    const closeButton = screen.getByRole('button', { name: 'Delete conversation Main chat' });
    await act(async () => { fireEvent.click(closeButton); });
    expect(screen.getByText(/Its server session directory and ledger will also be removed/)).toBeTruthy();
    expect(actions.closeSession).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
    expect(actions.closeSession).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(closeButton); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); });
    expect(actions.closeSession).toHaveBeenCalledTimes(1);
    expect(actions.closeSession).toHaveBeenCalledWith('session-one');
  });

  it('refreshes history on open and uses history rows as session switchers', async () => {
    const actions = installSessionState();
    render(<SessionTabStrip />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Conversation history' })); });
    expect(actions.refreshSessions).toHaveBeenCalledTimes(1);

    const history = screen.getByTestId('chat-session-history');
    const sceneRow = history.querySelector<HTMLButtonElement>('[data-session-id="session-two"]');
    expect(sceneRow).toBeTruthy();
    await act(async () => { fireEvent.click(sceneRow!); });
    expect(actions.switchToSession).toHaveBeenCalledWith('session-two');
    expect(screen.queryByTestId('chat-session-history')).toBeNull();
  });
});
