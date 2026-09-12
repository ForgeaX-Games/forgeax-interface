import type { FeedbackSubmit } from '@forgeax/types/feedback';
import { STORAGE_KEYS } from '../../lib/storageKeys';

/** A submission is written here before the network request starts. The browser
 * database is the durable outbox for periods where the local Studio server is
 * restarting or unreachable; the entry is removed only after /api/feedback
 * acknowledges it. */
export interface PendingFeedbackSubmission {
  id: string;
  submit: FeedbackSubmit;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastError?: string;
}

const DB_NAME = 'forgeax-feedback';
const DB_VERSION = 1;
const STORE_NAME = 'pending-submissions';
let databasePromise: Promise<IDBDatabase> | null = null;

function isPendingSubmission(value: unknown): value is PendingFeedbackSubmission {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PendingFeedbackSubmission>;
  return typeof entry.id === 'string'
    && !!entry.submit
    && typeof entry.submit === 'object'
    && typeof entry.createdAt === 'string'
    && typeof entry.updatedAt === 'string'
    && typeof entry.attempts === 'number'
    && Number.isInteger(entry.attempts)
    && entry.attempts >= 0;
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  const opened = new Promise<IDBDatabase>((resolve, reject) => {
    const indexedDB = globalThis.indexedDB;
    if (!indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('failed to open feedback outbox'));
    request.onblocked = () => reject(new Error('feedback outbox upgrade blocked'));
  });
  databasePromise = opened.catch((error): never => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

async function idbList(): Promise<PendingFeedbackSubmission[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.filter(isPendingSubmission));
    request.onerror = () => reject(request.error ?? new Error('failed to read feedback outbox'));
  });
}

async function idbPut(entry: PendingFeedbackSubmission): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('failed to write feedback outbox'));
    transaction.onabort = () => reject(transaction.error ?? new Error('feedback outbox write aborted'));
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('failed to delete feedback outbox entry'));
    transaction.onabort = () => reject(transaction.error ?? new Error('feedback outbox delete aborted'));
  });
}

function fallbackList(): PendingFeedbackSubmission[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEYS.feedbackPendingSubmissions);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPendingSubmission) : [];
  } catch {
    return [];
  }
}

function fallbackWrite(entries: PendingFeedbackSubmission[]): void {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('localStorage unavailable');
  storage.setItem(STORAGE_KEYS.feedbackPendingSubmissions, JSON.stringify(entries));
}

function fallbackPut(entry: PendingFeedbackSubmission): void {
  const entries = fallbackList();
  const index = entries.findIndex((candidate) => candidate.id === entry.id);
  if (index >= 0) entries[index] = entry;
  else entries.push(entry);
  fallbackWrite(entries);
}

function fallbackDelete(id: string): void {
  const entries = fallbackList().filter((entry) => entry.id !== id);
  if (entries.length > 0) fallbackWrite(entries);
  else globalThis.localStorage?.removeItem(STORAGE_KEYS.feedbackPendingSubmissions);
}

/** Read both stores so an entry written during an IndexedDB outage is not lost
 * when IndexedDB becomes available again. Duplicate ids prefer IndexedDB. */
export async function listPendingFeedback(): Promise<PendingFeedbackSubmission[]> {
  const fallback = fallbackList();
  let indexed: PendingFeedbackSubmission[] = [];
  try {
    indexed = await idbList();
  } catch {
    // localStorage is the compatibility fallback for restricted/private webviews.
  }
  const merged = new Map(fallback.map((entry) => [entry.id, entry]));
  for (const entry of indexed) merged.set(entry.id, entry);
  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putPendingFeedback(entry: PendingFeedbackSubmission): Promise<void> {
  try {
    await idbPut(entry);
    // If this id was previously written to the fallback, remove that duplicate.
    try { fallbackDelete(entry.id); } catch { /* best effort */ }
    return;
  } catch (indexedError) {
    try {
      fallbackPut(entry);
      return;
    } catch (fallbackError) {
      throw new Error(
        `failed to persist feedback locally: ${String(indexedError)}; fallback: ${String(fallbackError)}`,
      );
    }
  }
}

export async function deletePendingFeedback(id: string): Promise<void> {
  await Promise.allSettled([
    idbDelete(id),
    Promise.resolve().then(() => fallbackDelete(id)),
  ]);
}
