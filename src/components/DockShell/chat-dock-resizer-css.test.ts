import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const css = readFileSync(fileURLToPath(new URL('./DockShell.css', import.meta.url)), 'utf8');

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1] ?? '';
}

describe('ChatDock resizer source contract (non-pixel)', () => {
  it('keeps the animated dock clipped but places its handle inside the hit-test boundary', () => {
    assert.match(ruleBody('.fx-dockregion-ChatDock'), /overflow:\s*hidden/);
    assert.match(ruleBody('.fx-dockregion-ChatDock > .fx-chat-resizer'), /left:\s*0/);
  });

  it('consumes the shell collapse flag without discarding the mounted dock width', () => {
    assert.match(
      ruleBody('.studio-shell[data-chatpanel-collapsed="1"] .fx-dockregion-ChatDock'),
      /display:\s*none/,
    );
  });
});
