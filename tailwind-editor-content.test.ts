import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEditorTailwindContent } from './tailwind-editor-content';

describe('createEditorTailwindContent', () => {
  test('uses one glob for all top-level editor package src trees', () => {
    const integrationRoot = resolve(import.meta.dir, '..', '..');
    const editorPackagesRoot = resolve(integrationRoot, 'packages/editor/packages');

    expect(createEditorTailwindContent(integrationRoot)).toEqual([
      `${editorPackagesRoot}/*/src/**/*.{ts,tsx}`,
    ]);
  });

  test('glob pattern matches every editor package that has a top-level src directory', () => {
    const integrationRoot = resolve(import.meta.dir, '..', '..');
    const editorPackagesRoot = resolve(integrationRoot, 'packages/editor/packages');
    const glob = createEditorTailwindContent(integrationRoot)[0];

    expect(glob).toBe(`${editorPackagesRoot}/*/src/**/*.{ts,tsx}`);

    const packagesWithSrc = readdirSync(editorPackagesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(resolve(editorPackagesRoot, name, 'src')));

    expect(packagesWithSrc).toContain('ui');
    expect(packagesWithSrc).toContain('panels');
    expect(packagesWithSrc.length).toBeGreaterThan(0);
  });

  test('returns no globs for a checkout without editor packages', () => {
    expect(createEditorTailwindContent('/tmp/forgeax-missing-editor')).toEqual([]);
  });
});
