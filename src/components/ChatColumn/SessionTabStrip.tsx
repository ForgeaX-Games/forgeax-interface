import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { History, MessageSquare, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslation } from '@/i18n';
import { tabLabel, useShellStore } from '../../store';
import { confirmDialog } from '../../lib/dialog';
import { formatSessionTime } from '../../lib/session-time';

export function SessionTabStrip() {
  const { t } = useTranslation();
  const tabs = useShellStore((state) => state.tabs);
  const activeSid = useShellStore((state) => state.activeSid);
  const activeGameSlug = useShellStore((state) => state.activeGameSlug);
  const switchToSession = useShellStore((state) => state.switchToSession);
  const closeSession = useShellStore((state) => state.closeSession);
  const createNewSession = useShellStore((state) => state.createNewSession);
  const refreshSessions = useShellStore((state) => state.refreshSessions);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [closingSid, setClosingSid] = useState<string | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeSid]);

  useEffect(() => {
    if (!historyOpen) return;
    void refreshSessions();
  }, [activeGameSlug, historyOpen, refreshSessions]);

  const sortedHistory = useMemo(() => {
    const now = Date.now();
    return [...tabs].sort((a, b) => {
      const aTime = a.lastActivityAt ?? now;
      const bTime = b.lastActivityAt ?? now;
      if (aTime !== bTime) return bTime - aTime;
      return a.sid.localeCompare(b.sid);
    });
  }, [historyOpen, tabs]);

  const selectSession = async (sid: string, closeHistory = false): Promise<void> => {
    if (sid !== activeSid) await switchToSession(sid);
    if (closeHistory) setHistoryOpen(false);
  };

  const createSession = async (): Promise<void> => {
    if (creating) return;
    setCreating(true);
    try {
      await createNewSession({ scope: activeGameSlug ?? undefined });
    } finally {
      setCreating(false);
    }
  };

  const deleteSession = async (sid: string, label: string): Promise<void> => {
    if (closingSid) return;
    const confirmed = await confirmDialog({
      body: t('sessionTabs.closeConfirm', { label }),
      danger: true,
    });
    if (!confirmed) return;
    setClosingSid(sid);
    try {
      await closeSession(sid);
    } finally {
      setClosingSid(null);
    }
  };

  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, sid: string): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabButtons = [...(tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    if (tabButtons.length === 0) return;
    const index = Math.max(0, tabs.findIndex((tab) => tab.sid === sid));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabButtons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length;
    event.preventDefault();
    tabButtons[nextIndex]?.focus();
    // Manual activation: arrows only move focus. Enter/Space/click activates
    // the focused button, avoiding overlapping async switchToSession calls
    // whose provider reconciliation can resolve out of order.
  };

  return (
    <div className="chat-session-tabs" data-testid="chat-session-tabs">
      <div ref={tabListRef} className="chat-session-tab-list" role="tablist" aria-label={t('sessionTabs.historyTitle')}>
        {tabs.map((tab) => {
          const active = tab.sid === activeSid;
          const label = tabLabel(tab);
          return (
            <div
              key={tab.sid}
              ref={active ? activeTabRef : undefined}
              className={`chat-session-tab${active ? ' is-active' : ''}`}
              data-session-id={tab.sid}
            >
              <button
                type="button"
                className="chat-session-tab-button no-motion-lift"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                title={label}
                onClick={() => void selectSession(tab.sid)}
                onKeyDown={(event) => moveFocus(event, tab.sid)}
              >
                <span className="chat-session-tab-label">{label}</span>
              </button>
              {active && (
                <button
                  type="button"
                  className="chat-session-tab-close no-motion-lift"
                  aria-label={t('sessionTabs.closeTab', { label })}
                  title={t('sessionTabs.closeTab', { label })}
                  disabled={closingSid === tab.sid}
                  onClick={() => void deleteSession(tab.sid, label)}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="chat-session-tab-tools">
        <button
          type="button"
          className="chat-session-tab-tool no-motion-lift"
          aria-label={t('sessionTabs.newSession')}
          title={t('sessionTabs.newSession')}
          disabled={creating}
          onClick={() => void createSession()}
        >
          <Plus size={16} />
        </button>

        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`chat-session-tab-tool no-motion-lift${historyOpen ? ' is-active' : ''}`}
              aria-label={t('sessionTabs.history')}
              title={t('sessionTabs.history')}
              aria-expanded={historyOpen}
            >
              <History size={16} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-auto border-0 bg-transparent p-0 shadow-none">
            <div className="chat-session-history" data-testid="chat-session-history">
              <div className="chat-session-history-title">
                <History size={16} />
                <span>{t('sessionTabs.historyTitle')}</span>
              </div>
              <div className="chat-session-history-list">
                {sortedHistory.length === 0 && (
                  <div className="chat-session-history-empty">{t('sessionTabs.empty')}</div>
                )}
                {sortedHistory.map((tab) => {
                  const label = tabLabel(tab);
                  const time = formatSessionTime(tab.lastActivityAt);
                  const active = tab.sid === activeSid;
                  return (
                    <button
                      key={tab.sid}
                      type="button"
                      className={`chat-session-history-row no-motion-lift${active ? ' is-active' : ''}`}
                      data-session-id={tab.sid}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => void selectSession(tab.sid, true)}
                    >
                      <MessageSquare size={15} />
                      <span className="chat-session-history-name">{label}</span>
                      {time && <span className="chat-session-history-time">{time}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
