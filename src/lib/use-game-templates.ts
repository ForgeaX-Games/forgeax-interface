import { useEffect, useState } from 'react';
import { listGameTemplates, type GameTemplate } from './game-templates';

/** Lazy catalog loading with explicit failure and user-triggered recovery. */
export function useGameTemplates(open: boolean) {
  const [templates, setTemplates] = useState<GameTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTemplates(null);
    setError(null);
    void listGameTemplates()
      .then((items) => { if (!cancelled) setTemplates(items); })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [open, attempt]);

  return { templates, error, retry: () => setAttempt((value) => value + 1) };
}
