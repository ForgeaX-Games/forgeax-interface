import { beforeEach, describe, expect, test } from 'bun:test';
import {
  captureFocusedTextEditTarget,
  configureTextClipboard,
  executeFocusedTextEditAction,
} from './text-edit-actions';

const clipboard = {
  text: '',
  async readText(): Promise<string> { return this.text; },
  async writeText(text: string): Promise<void> { this.text = text; },
};

beforeEach(() => {
  document.body.replaceChildren();
  clipboard.text = '';
  configureTextClipboard(null);
});

function focusedInput(value: string, start: number, end: number): HTMLInputElement {
  const input = document.createElement('input');
  input.value = value;
  document.body.append(input);
  input.focus();
  input.setSelectionRange(start, end);
  return input;
}

describe('focused text edit actions', () => {
  test('uses the product clipboard override when no explicit clipboard is passed', async () => {
    configureTextClipboard(clipboard);
    const input = focusedInput('desktop clipboard', 0, 7);

    expect(await executeFocusedTextEditAction('copy')).toBe(true);
    expect(clipboard.text).toBe('desktop');
  });

  test('copy and cut operate on the focused input selection', async () => {
    const input = focusedInput('hello world', 0, 5);
    let inputEvents = 0;
    input.addEventListener('input', () => { inputEvents += 1; });

    expect(await executeFocusedTextEditAction('copy', document, clipboard)).toBe(true);
    expect(clipboard.text).toBe('hello');
    expect(input.value).toBe('hello world');

    expect(await executeFocusedTextEditAction('cut', document, clipboard)).toBe(true);
    expect(clipboard.text).toBe('hello');
    expect(input.value).toBe(' world');
    expect(input.selectionStart).toBe(0);
    expect(inputEvents).toBe(1);
  });

  test('paste replaces the focused selection and emits a bubbling input event', async () => {
    const input = focusedInput('hello world', 6, 11);
    clipboard.text = 'ForgeaX';
    let bubbled = false;
    document.body.addEventListener('input', () => { bubbled = true; }, { once: true });

    expect(await executeFocusedTextEditAction('paste', document, clipboard)).toBe(true);
    expect(input.value).toBe('hello ForgeaX');
    expect(input.selectionStart).toBe(13);
    expect(input.selectionEnd).toBe(13);
    expect(bubbled).toBe(true);
  });

  test('select all stays in the focused input instead of selecting editor entities', async () => {
    const input = focusedInput('secret-key', 3, 3);

    expect(await executeFocusedTextEditAction('selectAll', document, clipboard)).toBe(true);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  test('returns false when focus is not a text-editable control', async () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();

    expect(await executeFocusedTextEditAction('selectAll', document, clipboard)).toBe(false);
  });

  test('copy, cut, paste and select-all operate on a contenteditable composer', async () => {
    const composer = document.createElement('div');
    composer.contentEditable = 'true';
    composer.tabIndex = 0;
    composer.textContent = 'hello world';
    document.body.append(composer);
    composer.focus();

    const selection = document.getSelection();
    const range = document.createRange();
    range.setStart(composer.firstChild!, 0);
    range.setEnd(composer.firstChild!, 5);
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(await executeFocusedTextEditAction('copy', document, clipboard)).toBe(true);
    expect(clipboard.text).toBe('hello');
    expect(await executeFocusedTextEditAction('cut', document, clipboard)).toBe(true);
    expect(composer.textContent).toBe(' world');

    clipboard.text = 'ForgeaX';
    expect(await executeFocusedTextEditAction('paste', document, clipboard)).toBe(true);
    expect(composer.textContent).toBe('ForgeaX world');
    expect(await executeFocusedTextEditAction('selectAll', document, clipboard)).toBe(true);
    expect(document.getSelection()?.toString()).toBe('ForgeaX world');
  });

  test('restores a captured composer selection after a web menu takes focus', async () => {
    const composer = document.createElement('div');
    composer.contentEditable = 'true';
    composer.tabIndex = 0;
    composer.textContent = 'Reply exactly OK';
    const menu = document.createElement('div');
    menu.tabIndex = 0;
    menu.setAttribute('role', 'menu');
    document.body.append(composer, menu);
    composer.focus();

    const selection = document.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(captureFocusedTextEditTarget(document)).toBe(true);

    menu.focus();
    expect(document.activeElement).toBe(menu);
    expect(await executeFocusedTextEditAction('copy', document, clipboard)).toBe(true);
    expect(clipboard.text).toBe('Reply exactly OK');
  });
});

test('menu paste dispatches images and documents once to the focused rich editor', async () => {
  const target = document.createElement('div');
  target.contentEditable = 'true';
  target.tabIndex = 0;
  target.textContent = 'keep draft';
  document.body.append(target);
  target.focus();
  const files: File[] = [];
  let events = 0;
  target.addEventListener('paste', (event) => {
    events++;
    files.push(...Array.from((event as ClipboardEvent).clipboardData!.files));
    event.preventDefault();
  });
  const richClipboard = {
    ...clipboard,
    async read() { return [{ types: ['image/png', 'application/pdf'], async getType(type: string) { return new Blob(['content'], {type}); } }] as ClipboardItems; },
  };
  expect(await executeFocusedTextEditAction('paste', document, richClipboard)).toBe(true);
  expect(files.map(file => file.type)).toEqual(['image/png', 'application/pdf']);
  expect(events).toBe(1);
  expect(target.textContent).toBe('keep draft');
});

test('empty clipboard does not delete selected text', async () => {
  const target = focusedInput('keep draft', 0, 10);
  await executeFocusedTextEditAction('paste', document, clipboard);
  expect(target.value).toBe('keep draft');
});

test('delayed clipboard read cannot paste into another focused editor', async () => {
  const first = focusedInput('first', 0, 5);
  let finish!: (text: string) => void;
  const pending = executeFocusedTextEditAction('paste', document, {
    ...clipboard, readText: () => new Promise<string>(resolve => { finish = resolve; }),
  });
  const second = focusedInput('second', 0, 6);
  finish('late data');
  expect(await pending).toBe(false);
  expect(first.value).toBe('first');
  expect(second.value).toBe('second');
});

test('read-only inputs consume mutations without changing content or clipboard', async () => {
  const input = focusedInput('read-only', 0, 9);
  input.readOnly = true;
  clipboard.text = 'original clipboard';
  for (const action of ['cut', 'paste', 'delete', 'undo', 'redo'] as const) {
    expect(await executeFocusedTextEditAction(action, document, clipboard)).toBe(true);
  }
  expect(input.value).toBe('read-only');
  expect(clipboard.text).toBe('original clipboard');
});

test('cut never deletes a changed selection after an asynchronous clipboard write', async () => {
  const input = focusedInput('first second', 0, 5);
  let finish!: () => void;
  const pending = executeFocusedTextEditAction('cut', document, {
    readText: async () => '', writeText: () => new Promise<void>(resolve => { finish = resolve; }),
  });
  input.setSelectionRange(6, 12);
  finish();
  expect(await pending).toBe(false);
  expect(input.value).toBe('first second');
});

test('copy and cut without selection preserve the clipboard', async () => {
  const input = focusedInput('draft', 2, 2);
  clipboard.text = 'preserve';
  await executeFocusedTextEditAction('copy', document, clipboard);
  await executeFocusedTextEditAction('cut', document, clipboard);
  expect(clipboard.text).toBe('preserve');
  expect(input.value).toBe('draft');
});
