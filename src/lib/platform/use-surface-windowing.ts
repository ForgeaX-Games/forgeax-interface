import { useSyncExternalStore } from 'react';
import { getSurfaceWindowingController } from './surface-windowing';

export function useFloatingSurfaces(): Readonly<Record<string, true>> {
  const controller = getSurfaceWindowingController();
  return useSyncExternalStore(
    controller.onChange,
    controller.snapshot,
    controller.snapshot,
  );
}
