import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const css = readFileSync(fileURLToPath(new URL('./composer-port.css', import.meta.url)), 'utf8');
const shell = readFileSync(fileURLToPath(new URL('./shell-layout.css', import.meta.url)), 'utf8');

// These source contracts protect the CSS/DOM integration points; they do not
// render the composer or assert pixel geometry. Browser layout evidence belongs
// to the integration smoke coverage.
describe('preview composer specialist chip source contracts (non-pixel)', () => {
  it('releases only the explicit specialist chip from icon-button sizing', () => {
    assert.match(css, /\.cb-at\.has-summon-chip\s*\{[\s\S]*flex:\s*0 1 auto[\s\S]*max-width:\s*min\(148px, calc\(100vw - 140px\)\)/);
    assert.match(css, /\.cb-at\.has-summon-chip > \.cb-at-chip\s*\{[\s\S]*width:\s*fit-content[\s\S]*max-width:\s*100%/);
  });

  it('lets the specialist chip ellipsis on a narrow row without resizing the model picker', () => {
    assert.match(css, /\.cb-left-group\.has-summon-chip\s*\{[\s\S]*flex:\s*0 1 auto[\s\S]*min-width:\s*0/);
    assert.match(css, /\.cb-left-group\.has-summon-chip \.cb-at\.has-summon-chip\s*\{[\s\S]*min-width:\s*47px/);
    assert.doesNotMatch(css, /\.cb-left-group\.has-summon-chip \.mp-root\.cb-mbsel\s*\{[\s\S]*max-width:\s*96px/);
    assert.match(css, /\.composer-bar \.mp-root\.cb-mbsel\s*\{[\s\S]*flex:\s*0 0 auto/);
  });

  it('keeps the specialist menu anchor in ChatPanel and uses one bounded grid column for the toolbar', () => {
    assert.doesNotMatch(css, /\.cb-at-menu-anchor\s*\{/);
    assert.match(shell, /\.studio-shell--preview-skin \.composer-bar \.cb-mbsel,[\s\S]*\.studio-shell--preview-skin \.composer-bar \.cb-cli\s*\{[\s\S]*position:\s*static/);
    assert.match(shell, /\.studio-shell--preview-skin \.composer-bar\.cb-at-menu-layout\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('keeps the toolbar controls as the layout sibling of the ChatPanel anchor', () => {
    assert.match(css, /\.composer-bar \.composer-toolbar-controls\s*\{[\s\S]*display:\s*flex[\s\S]*justify-content:\s*space-between/);
    assert.match(shell, /\.studio-shell--preview-skin \.composer-bar \.composer-toolbar-controls\s*\{[\s\S]*grid-area:\s*1 \/ 1[\s\S]*display:\s*flex/);
  });
});
