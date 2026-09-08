import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Tailwind `content` globs for in-process editor UI when Interface is mounted
 * inside forgeax-studio (IDE).
 *
 * One glob over every top-level package under packages/editor/packages with a
 * src/ tree. New editor packages are picked up without updating this file.
 */
export function createEditorTailwindContent(integrationRoot: string): string[] {
  const editorPackagesRoot = resolve(integrationRoot, 'packages/editor/packages');
  if (!existsSync(editorPackagesRoot)) return [];
  return [`${editorPackagesRoot}/*/src/**/*.{ts,tsx}`];
}
