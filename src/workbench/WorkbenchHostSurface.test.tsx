import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkbenchCatalogEntry } from '@forgeax/workbench-host/browser';
import {
  TRUSTED_WORKBENCH_SANDBOX,
  WorkbenchHostSurface,
  workbenchFrameContext,
} from './WorkbenchHostSurface';

const descriptor: WorkbenchCatalogEntry = {
  extensionId: '@forgeax/wb-game-video',
  runtimeId: 'runtime-video',
  title: 'Video Game',
  surface: 'split',
  panes: {
    left: { minWidth: 320, scrollable: true },
    center: { minHeight: 600, scrollable: false },
  },
  runtimeUrl: '/__workbench__/v1/extension/runtime-video/',
};

describe('WorkbenchHostSurface', () => {
  test('projects the authoritative game and runtime endpoints', () => {
    expect(workbenchFrameContext(descriptor, 'game/one')).toMatchObject({
      extensionId: '@forgeax/wb-game-video',
      runtimeId: 'runtime-video',
      gameId: 'game/one',
      endpoints: {
        gamePackage: '/__workbench__/v1/games/game%2Fone/package?runtimeId=runtime-video',
        extensionApi: '/__workbench__/v1/extension/runtime-video?gameId=game%2Fone',
      },
    });
  });

  test('renders a formal split workbench with trusted Host frames', () => {
    (window as Window & { happyDOM?: { setURL(url: string): void } }).happyDOM?.setURL(
      'http://localhost/',
    );
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <WorkbenchHostSurface descriptor={descriptor} gameId="game-one" />,
    );
    expect(container.querySelector('[data-workbench-surface="split"]')).not.toBeNull();
    expect(container.querySelector('[data-workbench-pane="left"]')).not.toBeNull();
    expect(container.querySelector('[data-workbench-pane="center"]')).not.toBeNull();
    const frames = [...container.querySelectorAll('iframe')];
    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => frame.getAttribute('sandbox'))).toEqual([
      TRUSTED_WORKBENCH_SANDBOX,
      TRUSTED_WORKBENCH_SANDBOX,
    ]);
    expect(frames.map((frame) => frame.getAttribute('src'))).toEqual([
      '/__workbench__/v1/extension/runtime-video/?pane=left',
      '/__workbench__/v1/extension/runtime-video/?pane=center',
    ]);
  });
});
