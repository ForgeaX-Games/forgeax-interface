import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

describe('App Shell browser runtime boundary', () => {
  test('consumes an ESM build without a bundled CommonJS ReactDOM runtime', async () => {
    const runtime = await Bun.file(join(
      import.meta.dir,
      '..',
      '..',
      '..',
      'node_modules',
      '@forgeax',
      'app-shell',
      'dist',
      'react.js',
    )).text();

    expect(runtime).not.toContain('node_modules/react-dom/');
    expect(runtime).not.toContain('__require("react")');
  });
});
