import { createSurfaceWindowingController } from '@forgeax/app-shell/window';
import { getWindowManager } from './window-manager';

export const VIEWPORT_CARRIER_WILL_DETACH = 'forgeax:viewport-carrier-will-detach' as const;

let controller: ReturnType<typeof createSurfaceWindowingController> | undefined;

/** Product adapter: App Shell owns state/transactions; Interface owns this event. */
export function getSurfaceWindowingController(): ReturnType<typeof createSurfaceWindowingController> {
  controller ??= createSurfaceWindowingController({
    manager: getWindowManager(),
    beforeDetach: (surface) => {
      if (surface.kind === 'panel' && surface.id === 'viewport') {
        window.dispatchEvent(new CustomEvent(VIEWPORT_CARRIER_WILL_DETACH));
      }
    },
  });
  return controller;
}
