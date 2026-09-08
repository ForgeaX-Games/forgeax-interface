import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
) as { exports: Record<string, string> };

describe('package exports', () => {
  it('points every concrete export at an existing source file', () => {
    const missing = Object.entries(packageJson.exports)
      .filter(([, target]) => !target.includes('*'))
      .filter(([, target]) => !existsSync(resolve(packageRoot, target)))
      .map(([specifier, target]) => `${specifier} -> ${target}`);

    expect(missing).toEqual([]);
  });

  it('exposes the shared panel and status-popover facade', () => {
    expect(packageJson.exports['./core/panels']).toBe('./src/core/panels/index.ts');
    expect(packageJson.exports['./components/StatusBar/StripPopover']).toBe(
      './src/components/StatusBar/StripPopover.tsx',
    );
    expect(packageJson.exports['./components/StatusBar/VersionBadge']).toBeUndefined();
  });

  it('does not expose Files application state from the reusable foundation', () => {
    expect(packageJson.exports['./lib/resource-preview']).toBeUndefined();
    expect(existsSync(resolve(packageRoot, 'src/lib/resource-preview.ts'))).toBe(false);
  });
});
