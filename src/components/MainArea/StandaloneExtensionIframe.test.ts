import { describe, expect, test } from 'bun:test';
import { buildIframeSrc } from './StandaloneExtensionIframe';
import type { ExtensionInfo } from '../../lib/extension-api';

const plugin: ExtensionInfo = {
  id: '@forgeax-extension/counter', version: '0.1.0', kind: 'page', displayName: 'Counter',
  frontendUrl: 'http://127.0.0.1:5173/custom?token=one', allowedOrigin: 'http://127.0.0.1:5173', runtimeMode: 'dev',
};

describe('StandaloneExtensionIframe explicit runtime URL', () => {
  test('prefers frontendUrl and preserves its path and query', () => {
    const url = buildIframeSrc(plugin, 'center', 'game-one');
    expect(url).toStartWith('http://127.0.0.1:5173/custom?token=one&');
    expect(url).toContain('pane=center');
    expect(url).toContain('slug=game-one');
  });
});
