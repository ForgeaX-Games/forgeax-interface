import type { MenuId } from '../../lib/menu-registry';

/**
 * A top-level trigger must claim the shared menubar state on pointer-down.
 * Radix still owns the matching open/close notification; this eager claim
 * prevents the controlled roots from dropping the first pointer interaction
 * while ownership moves between independent DropdownMenu roots.
 */
export function openMenuFromTriggerPointerDown(
  current: MenuId | null,
  menu: MenuId,
  event: Pick<PointerEvent, 'button' | 'ctrlKey'>,
): MenuId | null {
  // Match Radix Trigger's own activation gate. In particular, Ctrl+click is a
  // context-menu gesture on macOS and secondary buttons must not arm the bar.
  return event.button === 0 && !event.ctrlKey ? menu : current;
}
