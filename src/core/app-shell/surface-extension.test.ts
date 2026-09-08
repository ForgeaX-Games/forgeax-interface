import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { createAppSurfaceExtension } from './surface-extension';

const Comp = () => createElement('div');

describe('createAppSurfaceExtension', () => {
  it('maps an in-process panel into the shell registry', () => {
    const ext = createAppSurfaceExtension({
      id: 'studio.demo',
      title: 'Sample',
      panelId: 'demo',
      order: 7,
      icon: 'box',
      components: { Comp },
    });
    const desc = ext.contributes?.panels?.panels?.demo;
    expect(desc?.title).toBe('Sample');
    expect(desc?.order).toBe(7);
    expect(desc?.icon).toBe('box');
    expect(typeof desc?.render).toBe('function');
  });

  it('maps detached and overlay application surfaces without a manifest shim', () => {
    const detached = createAppSurfaceExtension({ id: 'detached.demo', title: 'Demo', surface: 'detached', components: { Demo: Comp } });
    const overlay = createAppSurfaceExtension({ id: 'overlay.demo', title: 'Demo', surface: 'overlay', components: { Demo: Comp } });
    expect(detached.contributes?.panels?.detached).toEqual({ Demo: Comp });
    expect(overlay.contributes?.panels?.overlays).toEqual({ Demo: Comp });
  });
});
