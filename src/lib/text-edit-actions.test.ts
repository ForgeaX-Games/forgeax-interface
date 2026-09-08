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
