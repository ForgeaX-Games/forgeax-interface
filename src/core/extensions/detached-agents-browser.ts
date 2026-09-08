import type React from 'react';
import { createAppSurfaceExtension } from '../app-shell/surface-extension';
import type { AppExtension } from '../app-shell/types';

export function createDetachedAgentsBrowserExtension(AgentsBrowser: React.ComponentType): AppExtension {
  return createAppSurfaceExtension({
    id: 'detached.agents-browser',
    title: 'Agents Browser',
    surface: 'detached',
    components: { AgentsBrowser },
  });
}
