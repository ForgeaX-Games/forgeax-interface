import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ExtensionCatalogEntry } from '@forgeax/extension-host/browser';
import {
  TRUSTED_EXTENSION_SANDBOX,
  ExtensionRuntimeFrame,
  extensionFrameContext,
} from './ExtensionRuntimeFrame';

const descriptor: ExtensionCatalogEntry = {
  extensionId: '@forgeax-extension/video-game',
  runtimeId: 'runtime-video',
  title: 'Video Game Studio',
  surface: 'split',
  runtimeUrl: '/__extension__/v1/extension/runtime-video/',
};

describe('ExtensionRuntimeFrame', () => {
  test('projects game and runtime identity into formal Host endpoints', () => {
    expect(extensionFrameContext(descriptor, 'game/one')).toMatchObject({
      extensionId: '@forgeax-extension/video-game',
      runtimeId: 'runtime-video',
      gameId: 'game/one',
      endpoints: {
        gamePackage: '/__extension__/v1/games/game%2Fone/package?runtimeId=runtime-video',
        extensionApi: '/__extension__/v1/extension/runtime-video?gameId=game%2Fone',
      },
    });
  });

  test('renders one handshake frame for its Page pane', () => {
    (window as Window & { happyDOM?: { setURL(url: string): void } }).happyDOM?.setURL(
      'http://localhost:18920/',
    );
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <ExtensionRuntimeFrame descriptor={descriptor} gameId="game-one" pane="left" />,
    );
    const frame = container.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe(
      '/__extension__/v1/extension/runtime-video/?pane=left',
    );
    expect(frame?.getAttribute('sandbox')).toBe(TRUSTED_EXTENSION_SANDBOX);
    expect(frame?.getAttribute('data-extension-runtime')).toBe(descriptor.extensionId);
  });
});
