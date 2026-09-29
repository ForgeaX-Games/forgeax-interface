/** recent-games —— File → 打开最近 submenu 的数据源。
 *
 *  菜单的 `dynamicChildren` 派生器必须**同步**求值 (Radix 在 submenu 展开时同步
 *  渲染 SubContent),而游戏列表来自 async 的 `listGames()`。本模块把二者解耦:
 *    - `warmRecentGames()` —— async 预取,在 File 菜单 dropdown 打开时调用一次,
 *      结果写入模块级缓存;
 *    - `getRecentGames(limit)` —— sync 读缓存,按 mtime 降序 (最近打开在前) 取前
 *      N 个,供 dynamicChildren 派生菜单项。
 *
 *  SSOT remains the server's /api/projects collection; the cache is only a
 *  的快照,不是第二真值源 (每次 File 菜单打开都重新 warm)。
 */
import {
	getStudioProjectClient,
	hasStudioDomainClients,
	type ProjectRow,
} from "../store-parts/domain-clients";

let cache: ProjectRow[] = [];
let revision = 0;
const listeners = new Set<() => void>();

export interface RecentProjectsRuntime {
	read(limit?: number): ProjectRow[];
	getRevision(): number;
	subscribe(listener: () => void): () => void;
	warm(): Promise<void>;
}

let productRuntime: RecentProjectsRuntime | undefined;
let pending = 0;
let cacheWarmed = false;

/** Install before any cache ownership exists; never abandon listeners or reads. */
export function configureRecentProjectsRuntime(
	runtime: RecentProjectsRuntime,
): void {
	if (productRuntime && productRuntime === runtime) return;
	if (productRuntime)
		throw new Error("Recent-project runtime already configured");
	if (
		!runtime ||
		["read", "getRevision", "subscribe", "warm"].some(
			(key) =>
				typeof runtime[key as keyof RecentProjectsRuntime] !== "function",
		)
	) {
		throw new Error("Invalid recent-project runtime");
	}
	if (
		cacheWarmed ||
		revision !== 0 ||
		cache.length !== 0 ||
		pending !== 0 ||
		listeners.size !== 0
	) {
		throw new Error("Configure recent-project runtime before cache use");
	}
	productRuntime = runtime;
}

export function subscribeRecentGames(listener: () => void): () => void {
	if (productRuntime) return productRuntime.subscribe(listener);
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Stable scalar snapshot for useSyncExternalStore consumers. */
export function getRecentGamesRevision(): number {
	if (productRuntime) return productRuntime.getRevision();
	return revision;
}

/** Prefetch the game list into the sync cache. Call when the File dropdown
 *  opens so `getRecentGames` has data ready by the time the submenu expands.
 *  Failures leave the previous cache intact (stale is better than empty flash). */
export async function warmRecentGames(): Promise<void> {
	if (productRuntime) return productRuntime.warm();
	if (!hasStudioDomainClients()) return;
	pending += 1;
	try {
		const j = await getStudioProjectClient().listProjects();
		const next = j.games ?? [];
		// An authoritative empty response is still a cache decision. A product
		// runtime must not replace this fallback after callers have warmed it.
		cacheWarmed = true;
		if (sameGameList(cache, next)) return;
		cache = next;
		revision += 1;
		listeners.forEach((listener) => {
			listener();
		});
	} catch {
		/* keep last-known cache on transient failure */
	} finally {
		pending -= 1;
	}
}

function sameGameList(
	left: readonly ProjectRow[],
	right: readonly ProjectRow[],
): boolean {
	if (left.length !== right.length) return false;
	return left.every((game, index) => {
		const other = right[index];
		return (
			other !== undefined &&
			game.slug === other.slug &&
			game.name === other.name &&
			game.mtime === other.mtime
		);
	});
}

/** Sync read: most-recently-modified games first, capped at `limit`.
 *  `GameRow` carries `mtime` under an index signature (typed `unknown`), so
 *  coerce defensively — a missing/NaN mtime sorts last rather than crashing. */
export function getRecentGames(limit = 8): ProjectRow[] {
	if (productRuntime) return productRuntime.read(limit);
	const mt = (g: ProjectRow): number => {
		const v = Number(g.mtime);
		return Number.isFinite(v) ? v : 0;
	};
	return [...cache].sort((a, b) => mt(b) - mt(a)).slice(0, limit);
}

/** Sync lookup against the warmed cache. Not authority — display projection only. */
export function getCachedGame(slug: string): ProjectRow | undefined {
	return cache.find((game) => game.slug === slug);
}
