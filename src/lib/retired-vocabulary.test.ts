import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dir, '../..');
const retiredFullTerm = ['work', 'bench'].join('');
const retiredFullTermPattern = new RegExp(retiredFullTerm, 'i');
const retiredPrefixPattern = /\b(?:wb|wm)[-_]/i;

function collectFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') return [];
    return collectFiles(resolve(path, entry.name));
  });
}

describe('Interface retired vocabulary gate', () => {
  test('keeps maintained source, contracts, and active documentation on Page terminology', () => {
    const roots = ['src', 'scripts', 'docs', 'README.md', 'packages/design/README.md', '.dependency-cruiser.cjs'];
    const violations = roots.flatMap((root) => collectFiles(resolve(repositoryRoot, root)))
      .flatMap((path) => {
        const text = readFileSync(path, 'utf8');
        const reasons = [
          retiredFullTermPattern.test(text) ? retiredFullTerm : '',
          retiredPrefixPattern.test(text) ? 'retired prefix' : '',
        ].filter(Boolean);
        return reasons.map((reason) => `${path.slice(repositoryRoot.length + 1)}: ${reason}`);
      });

    expect(violations).toEqual([]);
  });
});
