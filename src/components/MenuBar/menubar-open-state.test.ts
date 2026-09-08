import { describe, expect, test } from 'bun:test';
import { openMenuFromTriggerPointerDown } from './menubar-open-state';

describe('top-level menubar trigger state', () => {
  test('pointer-down opens a closed menu and keeps the open trigger open', () => {
    const primary = { button: 0, ctrlKey: false };
    expect(openMenuFromTriggerPointerDown(null, 'file', primary)).toBe('file');
    expect(openMenuFromTriggerPointerDown('file', 'file', primary)).toBe('file');
  });

  test('pointer-down transfers ownership directly to a sibling trigger', () => {
    expect(openMenuFromTriggerPointerDown('file', 'edit', { button: 0, ctrlKey: false })).toBe('edit');
  });

  test('secondary and macOS control-click gestures do not claim the menu', () => {
    expect(openMenuFromTriggerPointerDown(null, 'file', { button: 2, ctrlKey: false })).toBeNull();
    expect(openMenuFromTriggerPointerDown('edit', 'file', { button: 0, ctrlKey: true })).toBe('edit');
  });
});
