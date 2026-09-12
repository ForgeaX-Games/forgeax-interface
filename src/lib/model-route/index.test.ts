import { describe, expect, it } from 'bun:test';
import { initialSessionCatalogModel, passiveSessionCatalogModel, preferredCatalogModel } from '.';

describe('preferredCatalogModel', () => {
  const catalog = [
    { id: 'hidden-default', hidden: true },
    { id: 'visible-default' },
    { id: 'remembered-model' },
  ];

  it('preserves a visible remembered model', () => {
    expect(preferredCatalogModel(catalog, 'remembered-model')).toBe('remembered-model');
  });

  it('falls back to the first visible model when the remembered id is absent or hidden', () => {
    expect(preferredCatalogModel(catalog, 'missing-model')).toBe('visible-default');
    expect(preferredCatalogModel(catalog, 'hidden-default')).toBe('visible-default');
  });
});

describe('initialSessionCatalogModel', () => {
  const catalog = [{ id: 'scaffold-default' }, { id: 'remembered-model' }];

  it('keeps the remembered new-session model even when the scaffold default is also valid', () => {
    expect(initialSessionCatalogModel(catalog, 'claude-code', 'remembered-model')).toBe('remembered-model');
  });

  it('uses a CLI catalog default but leaves a native scaffold alone without a valid memory', () => {
    expect(initialSessionCatalogModel(catalog, 'codex', null)).toBe('scaffold-default');
    expect(initialSessionCatalogModel(catalog, null, null)).toBeUndefined();
  });
});

describe('passiveSessionCatalogModel', () => {
  const nativeCatalog = [{ id: 'claude-fable-5' }];
  it('does not replace a Codex choice when another browser opens the session with a native catalog', () => {
    expect(passiveSessionCatalogModel(nativeCatalog, 'gpt-5.6-luna', null)).toBeUndefined();
    expect(passiveSessionCatalogModel([], 'gpt-5.6-luna', null)).toBeUndefined();
  });
  it('preserves existing selections even if hidden or no longer advertised', () => {
    expect(passiveSessionCatalogModel([{ id: 'old', hidden: true }], 'old', 'new')).toBeUndefined();
  });
  it('seeds only an unconfigured session using a valid preference or catalog default', () => {
    expect(passiveSessionCatalogModel(nativeCatalog, null, null)).toBe('claude-fable-5');
    expect(passiveSessionCatalogModel([{ id: 'default' }, { id: 'chosen' }], undefined, 'chosen')).toBe('chosen');
    expect(passiveSessionCatalogModel([], null, null)).toBeUndefined();
  });
});
