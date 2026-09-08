import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const foundationFiles = [
  'bus.ts',
  'capabilities.ts',
  'commands.ts',
  'context-keys.ts',
  'contribution-registry.ts',
  'errors.ts',
  'loader.ts',
  'storage.ts',
  'types.ts',
] as const;

describe('extension platform browser boundary', () => {
  it('imports browser-safe subpaths instead of the Node-capable root entry', async () => {
    const foundationRoot = join(import.meta.dir, '..', 'extension-foundation');
    for (const file of foundationFiles) {
      const source = await Bun.file(join(foundationRoot, file)).text();
      expect(source).not.toMatch(/from ['"]@forgeax\/extension-platform['"]/);
    }
  });
});
