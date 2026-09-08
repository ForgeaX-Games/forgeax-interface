import { describe, expect, test } from 'bun:test';
import { saveAndVerifyDurably, verifyDurableSave } from './persistence';

describe('durable persistence verification', () => {
  test('requires a fresh reader and reports clean only after authoritative read-back', async () => {
    const result = await verifyDurableSave({
      requestId: 'save-1',
      writerRealmId: 'writer-1',
      authoritative: { revision: 4, scene: { name: 'checkpoint' } },
      createFreshReader: async () => ({
        realmId: 'reader-1',
        read: async () => ({ scene: { name: 'checkpoint' }, revision: 4 }),
      }),
    });

    expect(result).toMatchObject({ state: 'clean', readerRealmId: 'reader-1', requestId: 'save-1' });
  });

  test('does not report clean for a shared realm or failed read-back', async () => {
    await expect(verifyDurableSave({
      requestId: 'save-2',
      writerRealmId: 'writer-2',
      authoritative: { revision: 1 },
      createFreshReader: async () => ({ realmId: 'writer-2', read: async () => ({ revision: 1 }) }),
    })).resolves.toMatchObject({ state: 'unknown', error: { code: 'reader-not-independent' } });

    await expect(verifyDurableSave({
      requestId: 'save-3',
      writerRealmId: 'writer-3',
      authoritative: { revision: 2 },
      createFreshReader: async () => ({ realmId: 'reader-3', read: async () => { throw new Error('reader unavailable'); } }),
    })).resolves.toMatchObject({ state: 'unknown', error: { code: 'read-back-failed' } });
  });

  test('keeps a durability mismatch dirty instead of claiming a clean save', async () => {
    await expect(verifyDurableSave({
      requestId: 'save-4',
      writerRealmId: 'writer-4',
      authoritative: { revision: 4 },
      createFreshReader: async () => ({ realmId: 'reader-4', read: async () => ({ revision: 3 }) }),
    })).resolves.toMatchObject({ state: 'dirty', error: { code: 'durability-mismatch', retryable: true } });
  });

  test('does not claim clean when the authoritative Host save fails', async () => {
    await expect(saveAndVerifyDurably({
      requestId: 'save-5',
      writerRealmId: 'writer-5',
      save: async () => { throw new Error('host unavailable'); },
      createFreshReader: async () => ({ realmId: 'reader-5', read: async () => ({}) }),
    })).resolves.toMatchObject({ state: 'unknown', error: { code: 'save-failed' } });
  });
});
