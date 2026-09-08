const PROVIDER_OVERRIDE_KEY = 'forgeax.providerOverride';
const SETTINGS_SECTION_KEY = 'forgeax.settingsSection';
const ACTIVE_SID_KEY = 'forgeax.activeSid';
const AGENT_BY_SID_KEY = 'forgeax.agentBySid';
const LEGACY_TABS_KEY = 'forgeax.tabs';
const LEGACY_ACTIVE_TAB_KEY = 'forgeax.activeTabId';

export type DurablePersistenceState = 'dirty' | 'clean' | 'unknown';

export interface FreshReaderRealm<T> {
  readonly realmId: string;
  readonly read: () => Promise<T>;
}

export interface DurableSaveVerification<T> {
  readonly requestId: string;
  readonly state: DurablePersistenceState;
  readonly writerRealmId: string;
  readonly readerRealmId: string | null;
  readonly authoritative: T | null;
  readonly observed: T | null;
  readonly error?: {
    readonly code: 'invalid-request' | 'save-failed' | 'reader-not-independent' | 'read-back-failed' | 'durability-mismatch';
    readonly hint: string;
    readonly retryable: boolean;
    readonly recoveryActions: readonly string[];
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]));
  }
  return value;
}

function equalDurableValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export async function verifyDurableSave<T>(input: {
  readonly requestId: string;
  readonly writerRealmId: string;
  readonly authoritative: T;
  readonly createFreshReader: () => Promise<FreshReaderRealm<T>>;
}): Promise<DurableSaveVerification<T>> {
  const base = {
    requestId: input.requestId,
    writerRealmId: input.writerRealmId,
    authoritative: input.authoritative,
  };
  if (!input.requestId.trim() || !input.writerRealmId.trim()) {
    return {
      ...base,
      state: 'unknown',
      readerRealmId: null,
      observed: null,
      error: {
        code: 'invalid-request',
        hint: 'Save verification requires a requestId and writer realm identity.',
        retryable: false,
        recoveryActions: ['persistence.discover', 'persistence.retry'],
      },
    };
  }
  let reader: FreshReaderRealm<T>;
  try {
    reader = await input.createFreshReader();
  } catch {
    return {
      ...base,
      state: 'unknown',
      readerRealmId: null,
      observed: null,
      error: {
        code: 'read-back-failed',
        hint: 'The independent reader could not be created; durability is unknown.',
        retryable: true,
        recoveryActions: ['persistence.inspect', 'persistence.retry'],
      },
    };
  }
  if (!reader.realmId.trim() || reader.realmId === input.writerRealmId) {
    return {
      ...base,
      state: 'unknown',
      readerRealmId: reader.realmId || null,
      observed: null,
      error: {
        code: 'reader-not-independent',
        hint: 'Durability requires a newly created reader realm distinct from the writer.',
        retryable: false,
        recoveryActions: ['persistence.discover', 'persistence.retry'],
      },
    };
  }
  let observed: T;
  try {
    observed = await reader.read();
  } catch {
    return {
      ...base,
      state: 'unknown',
      readerRealmId: reader.realmId,
      observed: null,
      error: {
        code: 'read-back-failed',
        hint: 'The independent reader failed to read the authoritative value; durability is unknown.',
        retryable: true,
        recoveryActions: ['persistence.inspect', 'persistence.retry'],
      },
    };
  }
  if (!equalDurableValue(input.authoritative, observed)) {
    return {
      ...base,
      state: 'dirty',
      readerRealmId: reader.realmId,
      observed,
      error: {
        code: 'durability-mismatch',
        hint: 'The fresh reader observed a different authoritative value; the save is not clean.',
        retryable: true,
        recoveryActions: ['persistence.inspect', 'persistence.retry'],
      },
    };
  }
  return {
    ...base,
    state: 'clean',
    readerRealmId: reader.realmId,
    observed,
  };
}

export async function saveAndVerifyDurably<T>(input: {
  readonly requestId: string;
  readonly writerRealmId: string;
  readonly save: () => Promise<T>;
  readonly createFreshReader: () => Promise<FreshReaderRealm<T>>;
}): Promise<DurableSaveVerification<T>> {
  if (!input.requestId.trim() || !input.writerRealmId.trim()) return {
    requestId: input.requestId,
    writerRealmId: input.writerRealmId,
    state: 'unknown',
    readerRealmId: null,
    authoritative: null,
    observed: null,
    error: {
      code: 'invalid-request',
      hint: 'Save requires a requestId and writer realm identity.',
      retryable: false,
      recoveryActions: ['persistence.discover', 'persistence.retry'],
    },
  };
  let authoritative: T;
  try {
    authoritative = await input.save();
  } catch {
    return {
      requestId: input.requestId,
      writerRealmId: input.writerRealmId,
      state: 'unknown',
      readerRealmId: null,
      authoritative: null,
      observed: null,
      error: {
        code: 'save-failed',
        hint: 'The authoritative Host save failed; the durable state is unknown.',
        retryable: true,
        recoveryActions: ['persistence.inspect', 'persistence.retry'],
      },
    };
  }
  return verifyDurableSave({ ...input, authoritative });
}

export function loadProviderOverride(): string | null {
  try {
    const v = localStorage.getItem(PROVIDER_OVERRIDE_KEY);
    return v && v !== 'null' ? v : null;
  } catch {
    return null;
  }
}

export function saveProviderOverride(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(PROVIDER_OVERRIDE_KEY);
    else localStorage.setItem(PROVIDER_OVERRIDE_KEY, id);
  } catch {
    /* ignore (private mode / SSR) */
  }
}

export function loadSettingsSection(): string | null {
  try {
    const v = localStorage.getItem(SETTINGS_SECTION_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function saveSettingsSection(id: string | null): void {
  try {
    if (id) localStorage.setItem(SETTINGS_SECTION_KEY, id);
    else localStorage.removeItem(SETTINGS_SECTION_KEY);
  } catch {
    /* ignore */
  }
}

export function cleanupLegacySessionKeys(): void {
  try {
    localStorage.removeItem(LEGACY_TABS_KEY);
    localStorage.removeItem(LEGACY_ACTIVE_TAB_KEY);
  } catch {
    /* ignore (private mode / SSR) */
  }
}

export function loadAgentBySid(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AGENT_BY_SID_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [sid, agent] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof sid === 'string' && typeof agent === 'string' && sid && agent) {
        out[sid] = agent;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function persistAgentBySid(map: Record<string, string>): void {
  try {
    localStorage.setItem(AGENT_BY_SID_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function loadActiveSid(): string | null {
  try {
    const v = localStorage.getItem(ACTIVE_SID_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function persistActiveSid(sid: string | null): void {
  try {
    if (sid) localStorage.setItem(ACTIVE_SID_KEY, sid);
    else localStorage.removeItem(ACTIVE_SID_KEY);
  } catch {
    /* ignore */
  }
}
