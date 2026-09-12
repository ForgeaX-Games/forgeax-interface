import { useEffect, useSyncExternalStore } from 'react';
import { ChevronDown, Gamepad2, Loader2 } from 'lucide-react';
import { useCommand } from '../../core/app-shell';
import { useTranslation } from '@/i18n';
import { getBrandSync } from '../../brand/runtime';
import { applyStudioWindowTitle, formatStudioWindowTitle, resolveGameDisplayName } from '../../lib/active-game-chrome';
import {
  getCachedGame,
  getRecentGamesRevision,
  subscribeRecentGames,
  warmRecentGames,
} from '../../lib/recent-games';
import { useShellStore } from '../../store';
import './TopBar.css';

function useActiveGameLabel(): { slug: string | null; label: string; switching: boolean } {
  const { t } = useTranslation();
  const slug = useShellStore((s) => s.activeGameSlug);
  const runtime = useShellStore((s) => s.activeGameRuntime);
  useSyncExternalStore(subscribeRecentGames, getRecentGamesRevision);
  const cached = slug ? getCachedGame(slug) : undefined;
  const display = resolveGameDisplayName(slug, cached ? [cached] : []);
  return {
    slug,
    label: display ?? t('gameSwitcher.noneOpen'),
    switching: runtime.status === 'transitioning',
  };
}

/** TopBar identity pill. Click opens the existing `game.open` list — no second catalog. */
export function GameIdentityButton() {
  const { t } = useTranslation();
  const openGame = useCommand('game.open');
  const { slug, label, switching } = useActiveGameLabel();

  useEffect(() => {
    void warmRecentGames();
  }, [slug]);

  return (
    <div className="tb-game-switcher">
      <button
        type="button"
        className="tb-game-btn"
        data-testid="game-identity"
        data-game-slug={slug ?? ''}
        aria-busy={switching || undefined}
        title={slug
          ? t('gameSwitcher.triggerActive', { name: label, slug })
          : t('gameSwitcher.triggerEmpty')}
        onClick={() => { void openGame(); }}
      >
        <Gamepad2 size={16} />
        <span className="tb-game-label">{label}</span>
        {switching
          ? <Loader2 size={12} className="tb-spinner" aria-hidden="true" />
          : <ChevronDown size={16} />}
      </button>
    </div>
  );
}

/** Keep OS / browser window title in lockstep with the same store slug. */
export function ActiveGameWindowTitle() {
  const slug = useShellStore((s) => s.activeGameSlug);
  const gamesRevision = useSyncExternalStore(subscribeRecentGames, getRecentGamesRevision);
  const productName = getBrandSync().product.name;

  useEffect(() => {
    void warmRecentGames();
  }, [slug]);

  useEffect(() => {
    const cached = slug ? getCachedGame(slug) : undefined;
    const label = resolveGameDisplayName(slug, cached ? [cached] : []);
    void applyStudioWindowTitle(formatStudioWindowTitle(productName, label));
  }, [slug, productName, gamesRevision]);

  return null;
}
