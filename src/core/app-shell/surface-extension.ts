import { createElement, type ComponentType } from 'react';
import type { PanelRenderers } from '../../components/DockShell/panelRenderers';
import type { AppExtension } from './types';

export interface AppSurfaceExtensionInput {
  readonly id: string;
  readonly version?: string;
  readonly title: string;
  readonly panelId?: string;
  readonly surface?: 'dock' | 'detached' | 'chrome' | 'overlay' | 'slot';
  readonly order?: number;
  readonly icon?: string;
  readonly singleTab?: 'show' | 'hideTitle' | 'hide';
  readonly components: Record<string, ComponentType>;
}

/** Compose product-owned React surfaces into the shell without pretending they
 * are marketplace manifests. Extension manifests contribute Pages and Panels;
 * this adapter is only for Studio's in-process application assembly. */
export function createAppSurfaceExtension(input: AppSurfaceExtensionInput): AppExtension {
  const surface = input.surface ?? 'dock';
  let panels: Partial<PanelRenderers>;
  if (surface === 'detached' || surface === 'chrome') {
    panels = { [surface]: { ...input.components } } as Partial<PanelRenderers>;
  } else if (surface === 'overlay') {
    panels = { overlays: { ...input.components } } as Partial<PanelRenderers>;
  } else if (surface === 'slot') {
    panels = { slots: { ...input.components } } as Partial<PanelRenderers>;
  } else {
    const Component = Object.values(input.components)[0]!;
    const panelId = input.panelId ?? input.id;
    panels = {
      panels: {
        [panelId]: {
          title: input.title,
          order: input.order,
          icon: input.icon,
          ...(input.singleTab ? { dockChrome: { singleTab: input.singleTab } } : {}),
          render: () => createElement(Component),
        },
      },
    } as Partial<PanelRenderers>;
  }
  return { id: input.id, version: input.version ?? '1.0.0', contributes: { panels } };
}
