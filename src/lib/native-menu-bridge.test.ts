import { describe, expect, test } from 'bun:test';

describe('native menu startup contract', () => {
  test('installs the synchronous menu before warming recent games', async () => {
    const source = await Bun.file(new URL('./native-menu-bridge.ts', import.meta.url)).text();
    const pushStart = source.indexOf('async function pushMenusToNative');
    const initStart = source.indexOf('export async function initNativeMenuBridge');
    const pushBody = source.slice(pushStart, initStart);
    const initBody = source.slice(initStart);

    expect(pushBody).not.toContain('await warmRecentGames()');
    expect(initBody.indexOf('await pushMenusToNative(invoke, translate)')).toBeLessThan(
      initBody.indexOf('void warmRecentGames()'),
    );
  });

  test('uses the system menu on macOS and the visible main-window menu elsewhere', async () => {
    const rust = await Bun.file(new URL('../../src-tauri/src/lib.rs', import.meta.url)).text();

    expect(rust).toContain('#[cfg(target_os = "macos")]');
    expect(rust).toContain('menu.set_as_app_menu()');
    expect(rust).toContain('#[cfg(not(target_os = "macos"))]');
    expect(rust).toContain('get_webview_window("main")');
    expect(rust).toContain('window.set_menu(menu)');
    expect(rust).toContain('window.show_menu()');
  });
});
