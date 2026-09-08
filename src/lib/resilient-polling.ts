export interface ResilientPollOptions {
  intervalMs: number;
  timeoutMs?: number;
  maxBackoffMs?: number;
  isVisible?: () => boolean;
}

/** A settled poll: the next request is scheduled only after the previous one
 * finishes. It pauses while the document is hidden and backs off on failure. */
export function startResilientPoll(
  task: (signal: AbortSignal) => Promise<void>,
  options: ResilientPollOptions,
): () => void {
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxBackoffMs = options.maxBackoffMs ?? 30_000;
  const isVisible = options.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');

  const schedule = (delay: number) => {
    if (!stopped) timer = setTimeout(() => void run(), delay);
  };
  const run = async () => {
    if (stopped) return;
    if (!isVisible()) {
      schedule(options.intervalMs);
      return;
    }
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), timeoutMs);
    try {
      await task(controller.signal);
      failures = 0;
    } catch {
      failures += 1;
    } finally {
      clearTimeout(timeout);
      controller = undefined;
      const delay = failures === 0
        ? options.intervalMs
        : Math.min(maxBackoffMs, options.intervalMs * (2 ** Math.min(failures - 1, 4)));
      schedule(delay);
    }
  };

  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    controller?.abort();
  };
}

export type ExtensionStatusKind = 'model-binding' | 'skill' | 'tool' | 'agent';
export type ExtensionKindCounts = Record<ExtensionStatusKind, { count: number; ids: string[] }>;

export function deriveExtensionKindCounts(
  items: readonly { id: string; kind: string }[],
): ExtensionKindCounts {
  const result: ExtensionKindCounts = {
    'model-binding': { count: 0, ids: [] },
    skill: { count: 0, ids: [] },
    tool: { count: 0, ids: [] },
    agent: { count: 0, ids: [] },
  };
  for (const item of items) {
    if (!(item.kind in result)) continue;
    const row = result[item.kind as ExtensionStatusKind];
    row.count += 1;
    row.ids.push(item.id);
  }
  return result;
}
