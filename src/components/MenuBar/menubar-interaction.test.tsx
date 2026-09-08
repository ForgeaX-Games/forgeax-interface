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
const { TopMenu } = await import('./MenuBar');
const { openMenuFromTriggerPointerDown } = await import('./menubar-open-state');
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

describe('MenuBar top-level interaction', () => {
  test('portalled menus own their surface styling without Tailwind utilities', async () => {
    const css = await Bun.file(new URL('./MenuBar.css', import.meta.url)).text();
    const contentRule = css.match(/\.fx-menubar-content\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(contentRule).toContain('background: var(--color-background-elevated');
    expect(contentRule).toContain('border: 1px solid var(--color-border-default');
    expect(contentRule).toContain('box-shadow:');
  });

  test('two controlled Radix roots open, close, and transfer ownership like MenuBar', async () => {
    function Fixture() {
      const [openMenu, setOpenMenu] = React.useState<'file' | 'edit' | null>(null);
      const onOpenChange = (menu: 'file' | 'edit') => (isOpen: boolean) => {
        setOpenMenu((cur) => (isOpen ? menu : cur === menu ? null : cur));
      };
      const onPointerDown = (menu: 'file' | 'edit') => (event: React.PointerEvent<HTMLButtonElement>) => {
        setOpenMenu((cur) => openMenuFromTriggerPointerDown(cur, menu, event.nativeEvent) as typeof cur);
      };
      const onPointerEnter = (menu: 'file' | 'edit') => () => {
        setOpenMenu((cur) => (cur !== null && cur !== menu ? menu : cur));
      };
      const topMenu = (menu: 'file' | 'edit') => (
        <TopMenu
          menu={menu}
          items={[{
            id: `${menu}.test`,
            menu,
            group: 'test',
            order: 1,
            labelKey: `menu.${menu}.test`,
            commandId: `${menu}.test`,
            ...(menu === 'file' ? {
              children: [{
                id: 'file.child',
                menu: 'file' as const,
                group: 'test',
                order: 1,
                labelKey: 'menu.file.child',
                commandId: 'file.child',
              }],
            } : {}),
          }]}
          t={((key: string) => {
            if (key === `menubar.${menu}`) return menu === 'file' ? 'File' : 'Edit';
            if (key === 'menu.file.child') return 'file child';
            return `${menu} item`;
          }) as never}
          execute={() => {}}
          open={openMenu === menu}
          onOpenChange={onOpenChange(menu)}
          onTriggerPointerDown={onPointerDown(menu)}
          onTriggerEnter={onPointerEnter(menu)}
        />
      );
      return (
        <>
          {topMenu('file')}
          {topMenu('edit')}
          <button type="button" data-testid="late-file-close" onClick={() => onOpenChange('file')(false)} />
        </>
      );
    }

    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Fixture />));

    const file = document.querySelector<HTMLButtonElement>('button[data-menu="file"]');
    const edit = document.querySelector<HTMLButtonElement>('button[data-menu="edit"]');
    expect(file).toBeTruthy();
    expect(edit).toBeTruthy();
    const activate = async (trigger: HTMLButtonElement | null) => {
      await act(async () => {
        trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
        trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
      });
    };

    await activate(file);
    const fileMenu = document.querySelector<HTMLElement>('[role="menu"]');
    expect(fileMenu?.textContent).toContain('file item');
    expect(fileMenu?.style.zIndex).toBe('var(--z-menu)');

    const fileSubTrigger = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes('file item'));
    await act(async () => {
      fileSubTrigger?.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        pointerType: 'mouse',
      }));
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    const openMenus = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]'));
    expect(openMenus).toHaveLength(2);
    expect(openMenus.every((menu) => menu.style.zIndex === 'var(--z-menu)')).toBe(true);

    await activate(file);
    expect(document.querySelector('[role="menu"]')).toBeNull();

    await activate(file);
    await act(async () => {
      edit?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, button: 0 }));
    });
    expect(document.querySelector('[role="menu"]')?.textContent).toContain('edit item');

    // A late close notification from File must not clear Edit's ownership.
    const lateFileClose = document.querySelector<HTMLButtonElement>('[data-testid="late-file-close"]');
    await act(async () => lateFileClose?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(document.querySelector('[role="menu"]')?.textContent).toContain('edit item');
  });
});
