/** permission-stream — interface side of the command-permission approval loop.
 *
 *  Subscribes to `onSessionEvent` and consumes two event types the server
 *  publishes while a turn is blocked waiting on a tool permission:
 *
 *    permission:request   → a gated command needs approval; show an approval card
 *    permission:resolved  → it was answered / timed out / aborted; dismiss the card
 *
 *  Exposes `usePendingPermission(sid)` — the current pending request for a
 *  session (or null). `<PermissionPrompt/>` renders it and POSTs the user's
 *  decision to /:sid/permission-reply, which unblocks the held HTTP request in
 *  the MCP permission server → the command executes or is blocked.
 *
 *  Mirrors file-activity-stream's module-singleton + useSyncExternalStore shape;
 *  events with type `permission:*` are routed here exclusively. */

import { useSyncExternalStore } from 'react';
import { getSessionClient, type SessionEvent } from '../store-parts/session-client';

export interface PendingPermission {
  reqId: string;
  toolName: string;
  command: string;
  agent: string;
  /** Raw tool input. For AskUserQuestion it holds { questions: [...] } so the
   *  card can render the option picker and return the user's answers. */
  input?: unknown;
  /** 信任闸命中的能力(exec/write/network/credential/delete);trust-gate ask 卡有,
   *  CC permission-prompt 卡无。用于卡片副标题 + 「记住本会话」的归类。 */
  capability?: string;
  /** trust-gate ask 卡允许「记住本会话」(CC 卡为 false/缺省)。 */
  canRemember?: boolean;
}

export interface ResolvedPermission {
  sid: string;
  reqId: string;
  toolName: string;
  questions: Array<{ question: string; values: string[] }>;
}

const _state = new Map<string, PendingPermission>();
const _resolved = new Map<string, ResolvedPermission>();
const _listeners = new Set<() => void>();

/** Permission side-channel providers use their own spelling for the same
 * AskUserQuestion contract. Keep this tiny normalizer in the shared interface
 * layer so the prompt and its WAL replay agree without importing chat UI code. */
export function isAskUserToolName(toolName: string): boolean {
  const bare = toolName.replace(/^(mcp__fxt__|fxt__)/, '');
  return bare === 'AskUserQuestion' || bare === 'ask_user';
}

function notify(): void {
  for (const l of _listeners) l();
}

function questionList(input: unknown): Array<{ question: string }> {
  if (!input || typeof input !== 'object') return [];
  const questions = (input as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((question): Array<{ question: string }> => {
    if (!question || typeof question !== 'object') return [];
    const text = (question as { question?: unknown }).question;
    return typeof text === 'string' && text ? [{ question: text }] : [];
  });
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => typeof item === 'string' ? [[key, item] as const] : []));
}

function valuesRecord(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => {
      if (!Array.isArray(item)) return [];
      const values = item.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
      return values.length ? [[key, values] as const] : [];
    }));
}

function resolvedFrom(
  sid: string,
  reqId: string,
  toolName: string,
  input: unknown,
  answers: unknown,
  answerValues: unknown,
): ResolvedPermission | null {
  if (!isAskUserToolName(toolName)) return null;
  const questions = questionList(input);
  const structured = valuesRecord(answerValues);
  const legacy = stringRecord(answers);
  const rows = questions.map(({ question }) => {
    const values = structured[question] ?? (legacy[question]
      ? legacy[question].split(',').map((value) => value.trim()).filter(Boolean)
      : []);
    return { question, values };
  });
  return rows.some((row) => row.values.length > 0)
    ? { sid, reqId, toolName, questions: rows }
    : null;
}

function dispatchPermission(evt: SessionEvent): void {
  const t = evt.event.type;
  if (t !== 'permission:request' && t !== 'permission:resolved') return;
  const sid = evt.sid;
  const p = (evt.event.payload ?? {}) as Partial<PendingPermission> & {
    reqId?: string;
    answers?: unknown;
    answerValues?: unknown;
  };
  if (typeof p.reqId !== 'string') return;
  if (t === 'permission:request') {
    // A new request starts a fresh interaction. The single notify below is
    // enough for both clearing the old resolved summary and publishing the
    // new pending card.
    _resolved.delete(sid);
    _state.set(sid, {
      reqId: p.reqId,
      toolName: typeof p.toolName === 'string' ? p.toolName : 'tool',
      command: typeof p.command === 'string' ? p.command : '',
      agent: typeof p.agent === 'string' ? p.agent : 'forge',
      input: (p as { input?: unknown }).input,
      ...(typeof p.capability === 'string' ? { capability: p.capability } : {}),
      ...((p as { canRemember?: unknown }).canRemember === true ? { canRemember: true } : {}),
    });
  } else {
    const current = _state.get(sid);
    const resolved = resolvedFrom(
      sid,
      p.reqId,
      typeof p.toolName === 'string' ? p.toolName : current?.toolName ?? '',
      p.input ?? current?.input,
      p.answers,
      p.answerValues,
    );
    if (resolved) _resolved.set(sid, resolved);
    // resolved — clear only if it's the same request still showing.
    if (_state.get(sid)?.reqId === p.reqId) _state.delete(sid);
  }
  notify();
}

/** Wired in main.tsx. Idempotent (same handler key, HMR-safe). */
export function subscribePermissionStream(): void {
  getSessionClient().onSessionEvent('permission', dispatchPermission);
}

function subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

/** React hook — the pending permission request for `sid`, or null. */
export function usePendingPermission(sid: string | null): PendingPermission | null {
  return useSyncExternalStore(
    subscribe,
    () => (sid ? _state.get(sid) ?? null : null),
    () => null,
  );
}

/** React hook — the latest resolved CLI AskUserQuestion summary for `sid`. */
export function useResolvedPermission(sid: string | null): ResolvedPermission | null {
  return useSyncExternalStore(
    subscribe,
    () => (sid ? _resolved.get(sid) ?? null : null),
    () => null,
  );
}

/** Non-React read used by replay/integration tests and host diagnostics. */
export function getResolvedPermission(sid: string): ResolvedPermission | null {
  return _resolved.get(sid) ?? null;
}

/** Optimistically retain a confirmed multi-question answer until the durable
 * permission:resolved event arrives. The server event remains the replay SSOT. */
export function recordResolvedPermission(
  sid: string,
  resolved: Omit<ResolvedPermission, 'sid'>,
): void {
  _resolved.set(sid, { sid, ...resolved });
  notify();
}

/** Feed permission events recovered from a session ledger into the same
 * reducer used by live WS frames. This keeps a resolved Ask collapsed after a
 * refresh without making React state the source of truth. */
export function replayPermissionEvents(
  sid: string,
  events: Array<{ type?: string; source?: string; ts?: number; payload?: unknown }>,
): void {
  for (const event of events) {
    if (event.type !== 'permission:request' && event.type !== 'permission:resolved') continue;
    const payload = event.payload && typeof event.payload === 'object'
      ? event.payload as Record<string, unknown>
      : {};
    dispatchPermission({
      type: 'session-event',
      sid,
      event: {
        source: event.source ?? 'replay',
        type: event.type,
        payload,
        ts: event.ts ?? 0,
      },
    });
  }
}

/** Optimistically clear the local card (called right after POSTing a reply, so
 *  the UI dismisses immediately without waiting for the permission:resolved
 *  round-trip). */
export function clearPendingPermission(sid: string, reqId: string): void {
  if (_state.get(sid)?.reqId === reqId) {
    _state.delete(sid);
    notify();
  }
}

/** Evict on session close (mirror dropFileActivitySession — avoid retaining
 *  closed-session state). */
export function dropPermissionSession(sid: string): void {
  const changed = _state.delete(sid) || _resolved.delete(sid);
  if (changed) notify();
}
