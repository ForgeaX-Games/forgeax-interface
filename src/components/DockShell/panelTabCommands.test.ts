import { describe, expect, it } from 'bun:test';
import { createPanelTabCommands } from './panelTabCommands';

describe('createPanelTabCommands', () => {
  it('closes a panel through the dockview api', () => {
    let closed = false;
    const panel = {
      id: 'chat',
      api: { close: () => { closed = true; } },
    };
    createPanelTabCommands({
      getApi: () => null,
      titleFor: (id) => id,
    }).close(panel as never);
    expect(closed).toBe(true);
  });
});
