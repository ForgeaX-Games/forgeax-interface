/**
 * bus-api degrade contract: the plugin bus is a studio-only surface. The
 * standalone editor has no bus router, so listExtensions() must DEGRADE to an
 * empty list — never throw — whichever way "no backend" presents:
 *   - no `--game`: SPA fallback → 200 + text/html
 *   - with `--game`: game-backend answers non-bus routes → 404 + json
 * Regression guard for the Uncaught(in promise) Error that the 404+json case
 * raised in DockShell's boot effect before the fix.
 */
import { describe, it, expect, afterEach } from 'bun:test';
import { extensionIdSlug, extensionManifestSourceLabel, listExtensions } from './extension-api';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const mockFetch = (status: number, contentType: string, body: string) => {
  globalThis.fetch = (async () =>
    new Response(body, { status, headers: { 'content-type': contentType } })) as typeof fetch;
};

describe('listExtensions — no-bus degrade', () => {
  it('404 + json (--game game-backend) → empty list, no throw', async () => {
    mockFetch(404, 'application/json', JSON.stringify({ error: 'not found' }));
    const res = await listExtensions('extension');
    expect(res).toEqual({ kind: 'extension', count: 0, items: [] });
  });

  it('200 + html (no-game SPA fallback) → empty list, no throw', async () => {
    mockFetch(200, 'text/html', '<!doctype html><html></html>');
    const res = await listExtensions('extension');
    expect(res).toEqual({ kind: 'extension', count: 0, items: [] });
  });

  it('200 + json (real bus) → parsed payload', async () => {
    const payload = { kind: 'extension', count: 1, items: [{ id: 'p1' }] };
    mockFetch(200, 'application/json', JSON.stringify(payload));
    const res = await listExtensions('extension');
    expect(res).toEqual(payload);
  });

  it('200 + incomplete json → empty list, no throw', async () => {
    mockFetch(200, 'application/json', JSON.stringify({}));
    const res = await listExtensions('extension');
    expect(res).toEqual({ kind: 'extension', count: 0, items: [] });
  });
});

describe('extensionIdSlug — strip known package scopes', () => {
  it('strips @forgeax-extension/ and @forgeax/', () => {
    expect(extensionIdSlug('@forgeax-extension/reel')).toBe('reel');
    expect(extensionIdSlug('@forgeax-extension/video-game')).toBe('video-game');
  });

  it('leaves bare slugs unchanged and does not mangle @forgeax-extension as @forgeax', () => {
    expect(extensionIdSlug('video-game')).toBe('video-game');
    expect(extensionIdSlug('@forgeax-extension/reel')).not.toBe('extension/reel');
  });
});

describe('extensionManifestSourceLabel — runtime source descriptor', () => {
  it('labels product-selected packages without inventing a Marketplace source path', () => {
    const label = extensionManifestSourceLabel({
      id: '@forgeax-extension/character-3d',
      version: '0.5.1',
      source: { origin: 'npm', relativeManifestPath: 'character-3d/forgeax-extension.json' },
    });

    expect(label).toBe('npm:@forgeax-extension/character-3d@0.5.1/forgeax-extension.json');
    expect(label).not.toContain('marketplace/extensions');
  });

  it('keeps mutable origins explicit and browser-safe', () => {
    expect(extensionManifestSourceLabel({
      id: '@forgeax-extension/local',
      version: '0.1.0',
      source: { origin: 'project', relativeManifestPath: 'local/forgeax-extension.json' },
    })).toBe('project:local/forgeax-extension.json');
  });

  it('falls back to package identity when an older server omits source metadata', () => {
    expect(extensionManifestSourceLabel({
      id: '@forgeax-extension/legacy-client',
      version: '0.1.0',
    })).toBe('extension:@forgeax-extension/legacy-client@0.1.0');
  });
});
