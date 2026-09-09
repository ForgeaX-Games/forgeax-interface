export type TextEditAction = 'cut' | 'copy' | 'paste' | 'selectAll' | 'undo' | 'redo' | 'delete';

export interface TextClipboard {
  readText(): Promise<string>;
  read?(): Promise<ClipboardItems>;
  writeText(text: string): Promise<void>;
}

let configuredClipboard: TextClipboard | null = null;

/** Product host override for environments whose WebView clipboard API is not
 * reliable. Passing null restores the browser clipboard. */
export function configureTextClipboard(clipboard: TextClipboard | null): void {
  configuredClipboard = clipboard;
}

function defaultClipboard(): TextClipboard | undefined {
  const configured = configuredClipboard;
  if (!configured) return navigator.clipboard;
  return {
    readText: () => configured.readText(),
    writeText: text => configured.writeText(text),
    read: configured.read?.bind(configured) ?? navigator.clipboard?.read?.bind(navigator.clipboard),
  };
}

export type NativeTextEditTarget = HTMLInputElement | HTMLTextAreaElement;
export type TextEditTarget = NativeTextEditTarget | HTMLElement;

interface CapturedTextEditTarget {
  readonly target: TextEditTarget;
  readonly selectionStart?: number | null;
  readonly selectionEnd?: number | null;
  readonly range?: Range;
}

const capturedTargets = new WeakMap<Document, CapturedTextEditTarget>();

const NON_TEXT_INPUT_TYPES = new Set([
  'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range',
  'reset', 'submit',
]);

export function textEditTargetFrom(target: EventTarget | null): TextEditTarget | null {
  if (!(target instanceof Element)) return null;
  const candidate = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    ? target
    : target.closest('input, textarea');
  if (candidate instanceof HTMLTextAreaElement) return candidate;
  if (candidate instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(candidate.type)) return candidate;
  const editable = target.closest<HTMLElement>('[contenteditable]:not([contenteditable="false"])');
  return editable instanceof HTMLElement ? editable : null;
}

export function selectedText(target: TextEditTarget): string {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
    const selection = target.ownerDocument.getSelection();
    if (!selection || selection.rangeCount === 0) return '';
    const range = selection.getRangeAt(0);
    return rangeBelongsTo(range, target) ? selection.toString() : '';
  }
  const start = target.selectionStart;
  const end = target.selectionEnd;
  return typeof start === 'number' && typeof end === 'number'
    ? target.value.slice(start, end)
    : '';
}

function setNativeValue(target: NativeTextEditTarget, value: string): void {
  const prototype = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(target, value);
  else target.value = value;
}

function replaceNativeSelection(target: NativeTextEditTarget, inserted: string): void {
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  const nextValue = target.value.slice(0, start) + inserted + target.value.slice(end);
  setNativeValue(target, nextValue);
  const caret = start + inserted.length;
  try { target.setSelectionRange(caret, caret); } catch { /* unsupported input type */ }
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.focus();
}

function rangeBelongsTo(range: Range, target: HTMLElement): boolean {
  const container = range.commonAncestorContainer;
  return container === target || target.contains(container);
}

function selectionRangeFor(target: HTMLElement): Range {
  const ownerDocument = target.ownerDocument;
  const selection = ownerDocument.getSelection();
  if (selection && selection.rangeCount > 0) {
    const current = selection.getRangeAt(0);
    if (rangeBelongsTo(current, target)) return current;
  }
  const range = ownerDocument.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  return range;
}

function replaceContentEditableSelection(target: HTMLElement, inserted: string): void {
  target.focus();
  const selection = target.ownerDocument.getSelection();
  const range = selectionRangeFor(target);
  range.deleteContents();
  if (inserted.length > 0) {
    const text = target.ownerDocument.createTextNode(inserted);
    range.insertNode(text);
    range.setStartAfter(text);
  }
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

function replaceSelection(target: TextEditTarget, inserted: string): void {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    replaceNativeSelection(target, inserted);
    return;
  }
  replaceContentEditableSelection(target, inserted);
}

function selectAllText(target: TextEditTarget): void {
  target.focus();
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    try { target.setSelectionRange(0, target.value.length); } catch { target.select(); }
    return;
  }
  const selection = target.ownerDocument.getSelection();
  const range = target.ownerDocument.createRange();
  range.selectNodeContents(target);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function captureTarget(target: TextEditTarget): CapturedTextEditTarget {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return {
      target,
      selectionStart: target.selectionStart,
      selectionEnd: target.selectionEnd,
    };
  }
  const selection = target.ownerDocument.getSelection();
  const range = selection && selection.rangeCount > 0 && rangeBelongsTo(selection.getRangeAt(0), target)
    ? selection.getRangeAt(0).cloneRange()
    : undefined;
  return { target, range };
}

function restoreTarget(captured: CapturedTextEditTarget): TextEditTarget | null {
  const { target } = captured;
  if (!target.isConnected) return null;
  target.focus();
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (typeof captured.selectionStart === 'number' && typeof captured.selectionEnd === 'number') {
      try { target.setSelectionRange(captured.selectionStart, captured.selectionEnd); } catch { /* unsupported input type */ }
    }
    return target;
  }
  if (captured.range) {
    const selection = target.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(captured.range);
  }
  return target;
}

/** Preserve the focused editor before a web menu moves DOM focus into its
 * portalled menu surface. The next text command consumes this snapshot. */
export function captureFocusedTextEditTarget(ownerDocument: Document = document): boolean {
  const target = textEditTargetFrom(ownerDocument.activeElement);
  if (!target) {
    capturedTargets.delete(ownerDocument);
    return false;
  }
  capturedTargets.set(ownerDocument, captureTarget(target));
  return true;
}

export async function executeTextEditAction(
  action: TextEditAction,
  target: TextEditTarget,
  clipboard: TextClipboard | undefined = defaultClipboard(),
): Promise<boolean> {
  if (action === 'selectAll') {
    selectAllText(target);
    return true;
  }

  const native = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (action !== 'copy' && native && (target.readOnly || target.disabled)) return true;
  if (action === 'undo' || action === 'redo' || action === 'delete') {
    // The focused text control owns this action even when its history is empty.
    // Never fall through to scene history/deletion because execCommand returns false.
    target.focus();
    target.ownerDocument.execCommand(action);
    return true;
  }
  if (!clipboard) return false;
  if (action === 'copy' || action === 'cut') {
    const text = selectedText(target);
    if (!text) return true;
    const captured = captureTarget(target);
    const content = native ? target.value : target.innerHTML;
    await clipboard.writeText(text);
    if (action === 'copy') return true;
    if (!target.isConnected || target.ownerDocument.activeElement !== target) return false;
    if ((native ? target.value : target.innerHTML) !== content) return false;
    if (native) {
      if (target.selectionStart !== captured.selectionStart || target.selectionEnd !== captured.selectionEnd) return false;
    } else {
      const selection = target.ownerDocument.getSelection();
      if (!captured.range || !selection?.rangeCount) return false;
      const range = selection.getRangeAt(0);
      if (range.compareBoundaryPoints(Range.START_TO_START, captured.range) !== 0
        || range.compareBoundaryPoints(Range.END_TO_END, captured.range) !== 0) return false;
    }
    replaceSelection(target, '');
    return true;
  }

  // Rich editors consume the same paste event for native shortcuts and menus.
  // Never insert HTML here; the editor owns attachment and plain-text policy.
  const captured = captureTarget(target);
  const data = new DataTransfer();
  if (clipboard.read && !(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
    for (const item of await clipboard.read()) {
      for (const type of item.types) {
        if (type === 'text/plain') data.setData(type, await (await item.getType(type)).text());
        else if (!type.startsWith('text/')) {
          const blob = await item.getType(type);
          data.items.add(new File([blob], `clipboard-${data.files.length}`, { type }));
        }
      }
    }
  } else {
    data.setData('text/plain', await clipboard.readText());
  }
  // Do not target another editor after a pending clipboard permission/read.
  if (!target.isConnected || target.ownerDocument.activeElement !== target) return false;
  restoreTarget(captured);
  const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
  if (!target.dispatchEvent(paste)) return true;
  const text = data.getData('text/plain');
  if (text) replaceSelection(target, text);
  return Boolean(text);

}

export async function executeFocusedTextEditAction(
  action: TextEditAction,
  ownerDocument: Document = document,
  clipboard: TextClipboard | undefined = defaultClipboard(),
): Promise<boolean> {
  const activeTarget = textEditTargetFrom(ownerDocument.activeElement);
  const captured = activeTarget ? undefined : capturedTargets.get(ownerDocument);
  if (captured) capturedTargets.delete(ownerDocument);
  const target = activeTarget ?? (captured ? restoreTarget(captured) : null);
  return target ? executeTextEditAction(action, target, clipboard) : false;
}
