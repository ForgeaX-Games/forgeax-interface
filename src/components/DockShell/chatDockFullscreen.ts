export function handleFullscreenChatToggle(
  fullscreen: boolean,
  toggleChatpanel: () => void,
): boolean {
  if (!fullscreen) return false;
  toggleChatpanel();
  return true;
}

export function isFullscreenChatRestoreOwner({
  chatWasOpen,
  chatHome,
  region,
}: {
  chatWasOpen: boolean;
  chatHome: string;
  region: string;
}): boolean {
  // The physical panel identifies its owner while open. When it was already
  // closed, the configured home region owns any explicit fullscreen toggle.
  return chatWasOpen || chatHome === region;
}

export function resolveFullscreenChatRestoreIntent({
  ownsChat,
  chatpanelCollapsed,
}: {
  ownsChat: boolean;
  chatpanelCollapsed: boolean;
}): { chatWasOpen: boolean; hiddenByToggle: boolean } | null {
  if (!ownsChat) return null;
  return {
    chatWasOpen: !chatpanelCollapsed,
    hiddenByToggle: chatpanelCollapsed,
  };
}

export function shouldRestoreFullscreenChat({
  chatWasOpen,
  chatpanelCollapsed,
}: {
  chatWasOpen: boolean;
  chatpanelCollapsed: boolean;
}): boolean {
  return chatWasOpen && !chatpanelCollapsed;
}
