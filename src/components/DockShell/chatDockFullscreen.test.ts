import { describe, expect, it } from 'bun:test';
import {
  handleFullscreenChatToggle,
  isFullscreenChatRestoreOwner,
  resolveFullscreenChatRestoreIntent,
  shouldRestoreFullscreenChat,
} from './chatDockFullscreen';

describe('shouldRestoreFullscreenChat', () => {
  it('restores a previously visible panel only while the store still says expanded', () => {
    expect(shouldRestoreFullscreenChat({ chatWasOpen: true, chatpanelCollapsed: false })).toBe(true);
    expect(shouldRestoreFullscreenChat({ chatWasOpen: true, chatpanelCollapsed: true })).toBe(false);
  });

  it('never opens a panel that was already closed before fullscreen', () => {
    expect(shouldRestoreFullscreenChat({ chatWasOpen: false, chatpanelCollapsed: false })).toBe(false);
  });

  it('turns an explicit fullscreen expand into a restore intent for a closed home panel', () => {
    const ownsChat = isFullscreenChatRestoreOwner({
      chatWasOpen: false,
      chatHome: 'ChatDock',
      region: 'ChatDock',
    });
    expect(ownsChat).toBe(true);
    const intent = resolveFullscreenChatRestoreIntent({
      ownsChat,
      chatpanelCollapsed: false,
    });

    expect(intent).toEqual({ chatWasOpen: true, hiddenByToggle: false });
    expect(shouldRestoreFullscreenChat({
      chatWasOpen: intent?.chatWasOpen ?? false,
      chatpanelCollapsed: false,
    })).toBe(true);
  });

  it('tracks collapse and reversal in the region that owned a non-home chat panel', () => {
    const ownsChat = isFullscreenChatRestoreOwner({
      chatWasOpen: true,
      chatHome: 'DockShell',
      region: 'DockShell',
    });
    const collapsed = resolveFullscreenChatRestoreIntent({
      ownsChat,
      chatpanelCollapsed: true,
    });
    expect(collapsed).toEqual({ chatWasOpen: false, hiddenByToggle: true });

    const expandedAgain = resolveFullscreenChatRestoreIntent({
      ownsChat,
      chatpanelCollapsed: false,
    });
    expect(expandedAgain).toEqual({ chatWasOpen: true, hiddenByToggle: false });
  });

  it('does not let an unrelated dock region claim the fullscreen restore intent', () => {
    const ownsChat = isFullscreenChatRestoreOwner({
      chatWasOpen: false,
      chatHome: 'ChatDock',
      region: 'DockShell',
    });
    expect(ownsChat).toBe(false);
    expect(resolveFullscreenChatRestoreIntent({
      ownsChat,
      chatpanelCollapsed: false,
    })).toBeNull();
  });

  it('routes F1 to store intent without touching dock layout while fullscreen', () => {
    let toggles = 0;
    expect(handleFullscreenChatToggle(true, () => { toggles += 1; })).toBe(true);
    expect(toggles).toBe(1);

    expect(handleFullscreenChatToggle(false, () => { toggles += 1; })).toBe(false);
    expect(toggles).toBe(1);
  });
});
