/** Extract image files from a user-initiated paste event. Reading through the
 * event avoids proactive Clipboard API permission prompts and works for both
 * macOS Cmd+V and Windows/Linux Ctrl+V. */
export function clipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];

  const itemFiles = Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.toLowerCase().startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && file.type.toLowerCase().startsWith('image/'));
  if (itemFiles.length > 0) return itemFiles;

  // Some WebViews expose clipboard images only through files, not items.
  return Array.from(data.files ?? [])
    .filter((file) => file.type.toLowerCase().startsWith('image/'));
}

/** Feedback must never steal paste from a control that owns text/command
 * input. The document-level listener is active only when focus is outside
 * these elements. `closest` also covers icons/spans nested inside buttons. */
export function isClipboardPasteControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest([
    'input',
    'textarea',
    'button',
    'select',
    '[contenteditable="true"]',
    '[role="textbox"]',
  ].join(',')) !== null;
}
