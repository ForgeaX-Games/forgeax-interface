import { describe, expect, test } from 'bun:test';
import {
  clipboardImageFiles,
  isClipboardPasteControl,
} from './clipboard-images';

function transfer(input: {
  items?: Array<{ kind: string; type: string; getAsFile(): File | null }>;
  files?: File[];
  types?: string[];
}): DataTransfer {
  return input as unknown as DataTransfer;
}

describe('feedback clipboard images', () => {
  test('extracts image items and ignores pasted non-image files', () => {
    const image = new File(['png'], 'screenshot.png', { type: 'image/png' });
    const text = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    const data = transfer({
      items: [
        { kind: 'file', type: image.type, getAsFile: () => image },
        { kind: 'file', type: text.type, getAsFile: () => text },
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
      ],
    });

    expect(clipboardImageFiles(data)).toEqual([image]);
  });

  test('falls back to clipboard files for WebViews that omit item files', () => {
    const image = new File(['jpeg'], 'capture.jpg', { type: 'image/jpeg' });
    expect(clipboardImageFiles(transfer({ items: [], files: [image] }))).toEqual([image]);
  });

  test('treats form controls and editable descendants as paste owners', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.appendChild(icon);
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    const blank = document.createElement('div');

    expect(isClipboardPasteControl(input)).toBeTrue();
    expect(isClipboardPasteControl(textarea)).toBeTrue();
    expect(isClipboardPasteControl(icon)).toBeTrue();
    expect(isClipboardPasteControl(editable)).toBeTrue();
    expect(isClipboardPasteControl(blank)).toBeFalse();
  });
});
