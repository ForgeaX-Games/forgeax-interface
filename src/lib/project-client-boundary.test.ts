import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');

describe('Studio project client boundary', () => {
  test('routes maintained project consumers through the injected client', () => {
    for (const relativePath of [
      'components/Onboarding/OnboardingController.tsx',
      'components/TopBar/ProjectSwitcher.tsx',
      'lib/builtin-actions.ts',
      'main.tsx',
    ]) {
      const source = readFileSync(resolve(root, relativePath), 'utf8');
      expect(source).not.toContain("fetch('/api/projects");
    }
  });

  test('includes directory linking in the project capability', () => {
    const source = readFileSync(resolve(root, 'store-parts/domain-clients.ts'), 'utf8');
    expect(source).toContain('linkProject(path: string)');
  });
});
