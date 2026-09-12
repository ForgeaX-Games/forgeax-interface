/** Chrome projection of the server-authoritative active game.
 *
 *  Display name / window title read `activeGameSlug` from the shell store.
 *  They never own project identity; switch still goes through `game.pick` /
 *  `setActiveGame`.
 */
import { isTauri, loadWindowApi } from './platform/runtime';

export function resolveGameDisplayName(
  slug: string | null,
  games: readonly { readonly slug: string; readonly name?: string }[],
): string | null {
  if (!slug) return null;
  const name = games.find((game) => game.slug === slug)?.name?.trim();
  return name || slug;
}

export function formatStudioWindowTitle(productName: string, gameLabel: string | null): string {
  if (!gameLabel) return productName;
  return `${productName} — ${gameLabel}`;
}

export async function applyStudioWindowTitle(title: string): Promise<void> {
  if (typeof document !== 'undefined') document.title = title;
  if (!isTauri()) return;
  try {
    const windowApi = await loadWindowApi();
    const current = (windowApi as { getCurrentWindow?: () => { setTitle: (next: string) => Promise<void> } } | null)
      ?.getCurrentWindow?.();
    if (current) await current.setTitle(title);
  } catch {
    /* chrome projection must not block the shell */
  }
}
