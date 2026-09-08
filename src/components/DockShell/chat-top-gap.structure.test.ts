import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const shell = readFileSync(
  fileURLToPath(new URL('../../styles/forgeax-preview/shell-layout.css', import.meta.url)),
  'utf8',
);

describe('preview chat layout contract', () => {
  it('does not reserve top space for the hidden Chat agent capsule', () => {
    assert.match(
      shell,
      /\.studio-shell--preview-skin \.cp-thread\s*\{[^}]*padding:\s*0 14px 14px/,
    );
    assert.doesNotMatch(shell, /\.studio-shell--preview-skin \.cp-thread\s*\{[^}]*padding:\s*74px/);
  });
});
