import { beforeEach, describe, expect, test } from 'bun:test';
import { builtinCommandsExtension } from '../core/extensions/builtin-commands';
import { builtinMenusExtension } from '../core/extensions/builtin-menus';
import { editorCommandsExtension } from '../core/extensions/editor-commands';
import { registerKeyboardRouterDeps } from './global-shortcuts';
import {
  __resetMenuRegistryForTest,
  serializeMenusForNative,
  snapshotMenu,
} from './menu-registry';

beforeEach(() => {
  __resetMenuRegistryForTest();
  document.body.replaceChildren();
});

describe('text editing menu contract', () => {
  test('publishes enabled cut, copy and paste commands to web and native menus', () => {
    const cleanup = builtinMenusExtension.setup?.({} as never);
    const editItems = snapshotMenu('edit');

    expect(editItems.find((item) => item.id === 'edit.cut')?.commandId).toBe('text.cut');
    expect(editItems.find((item) => item.id === 'edit.copy')?.commandId).toBe('text.copy');
    expect(editItems.find((item) => item.id === 'edit.paste')?.commandId).toBe('text.paste');

    const nativeEdit = serializeMenusForNative((key) => key).find((menu) => menu.menu === 'edit');
    expect(nativeEdit?.items.find((item) => item.id === 'edit.cut')?.enabled).toBe(true);
    expect(nativeEdit?.items.find((item) => item.id === 'edit.copy')?.enabled).toBe(true);
    expect(nativeEdit?.items.find((item) => item.id === 'edit.paste')?.enabled).toBe(true);
    if (typeof cleanup === 'function') cleanup();
  });

  test('registers the commands referenced by the text edit menu', () => {
    const commands = new Set<string>();
    const cleanup = builtinCommandsExtension.setup?.({
      registerCommand(command: { id: string }) {
        commands.add(command.id);
        return () => commands.delete(command.id);
      },
    } as never);

    expect(commands).toContain('text.cut');
    expect(commands).toContain('text.copy');
    expect(commands).toContain('text.paste');
    if (typeof cleanup === 'function') cleanup();
  });

  test('editor.selectAll selects focused input text before falling back to entities', async () => {
    const commands = new Map<string, { execute: () => unknown }>();
    const cleanup = editorCommandsExtension.setup?.({
      registerCommand(command: { id: string; execute: () => unknown }) {
        commands.set(command.id, command);
        return () => commands.delete(command.id);
      },
    } as never);
    const input = document.createElement('input');
    input.value = 'api-key';
    document.body.append(input);
    input.focus();
    input.setSelectionRange(3, 3);

    await commands.get('editor.selectAll')?.execute();

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    if (typeof cleanup === 'function') cleanup();
  });

  test('editor.selectAll keeps the entity fallback outside text inputs', async () => {
    let entitySelections = 0;
    registerKeyboardRouterDeps({ selectAllEntities: () => { entitySelections += 1; } } as never);
    const commands = new Map<string, { execute: () => unknown }>();
    const cleanup = editorCommandsExtension.setup?.({
      registerCommand(command: { id: string; execute: () => unknown }) {
        commands.set(command.id, command);
        return () => commands.delete(command.id);
      },
    } as never);
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();

    await commands.get('editor.selectAll')?.execute();

    expect(entitySelections).toBe(1);
    registerKeyboardRouterDeps(null);
    if (typeof cleanup === 'function') cleanup();
  });
});
