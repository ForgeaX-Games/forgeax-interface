import { describe, expect, it } from 'bun:test';
import { chromeStatusBarExtension } from '../../../core/extensions/chrome-statusbar';

describe('status bar contribution layout contract', () => {
  it('keeps version control as the only left-slot game version item', () => {
    const items = Object.values(chromeStatusBarExtension.contributes?.panels?.stripItems ?? {});
    const left = items.filter((item) => item.location === 'statusbar.left');
    expect(left.map((item) => item.id)).not.toContain('project-version');
    expect(left.filter((item) => item.id === 'version-control')).toHaveLength(0);
  });

  it('keeps the ForgeaX build projection in the right slot at priority 1000', () => {
    const items = Object.values(chromeStatusBarExtension.contributes?.panels?.stripItems ?? {});
    const build = items.find((item) => item.id === 'forgeax-build-version');
    expect(build).toMatchObject({ location: 'statusbar.right', priority: 1000 });
  });
});
