import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

let registered = false;
try {
  GlobalRegistrator.register();
  registered = true;
} catch {
  // A package-level DOM harness may already be active.
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { Popover, PopoverContent, PopoverTrigger } = await import('./popover');
const { Dialog, DialogContent } = await import('./dialog');
const { act } = React;

let root: import('react-dom/client').Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

afterAll(() => {
  if (registered) GlobalRegistrator.unregister();
});

function mount(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  return act(async () => root?.render(node));
}

describe('shared portal layering', () => {
  test('popover content owns a menu layer while preserving caller styles', async () => {
    await mount(
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent data-testid="popover" style={{ color: 'rgb(1, 2, 3)' }}>
          Sessions
        </PopoverContent>
      </Popover>,
    );

    const content = document.querySelector<HTMLElement>('[data-testid="popover"]');
    expect(content?.style.zIndex).toBe('var(--z-menu)');
    expect(content?.style.color).toBe('rgb(1, 2, 3)');
  });

  test('dialog overlay and content own fixed, centered modal layers', async () => {
    await mount(
      <Dialog open>
        <DialogContent data-testid="dialog" style={{ width: '321px' }}>
          Feedback
        </DialogContent>
      </Dialog>,
    );

    const content = document.querySelector<HTMLElement>('[data-testid="dialog"]');
    const overlay = Array.from(document.querySelectorAll<HTMLElement>('[data-state="open"]'))
      .find((node) => node !== content && node.tagName === 'DIV');

    expect(overlay?.style.position).toBe('fixed');
    expect(overlay?.style.inset).toBe('0');
    expect(overlay?.style.zIndex).toBe('var(--z-app-modal)');
    expect(content?.style.position).toBe('fixed');
    expect(content?.style.left).toBe('50%');
    expect(content?.style.top).toBe('50%');
    expect(content?.style.transform).toBe('translate(-50%, -50%)');
    expect(content?.style.zIndex).toBe('var(--z-app-modal-top)');
    expect(content?.style.width).toBe('321px');
  });
});
