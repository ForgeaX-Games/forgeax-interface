// Host-side command contracts for chat task-flow actions.
//
// Interface owns registration and typed dispatch only.  Editor/workbench
// owners subscribe to the AppHost bus and provide the concrete side effects.

import type { AppExtension } from '../app-shell/types';
import { publish } from '../../lib/bus';

export interface FilesRevealArgs {
  path: string;
}

export interface BuildCreateArgs {
  version: string;
}

export interface BuildPlayArgs {
  version: string;
}

export interface HostCommandArgsById {
  'app.files.reveal': FilesRevealArgs;
  'app.build.create': BuildCreateArgs;
  'app.build.play': BuildPlayArgs;
}

export type HostCommandId = keyof HostCommandArgsById;
export type HostCommandArgs<I extends HostCommandId = HostCommandId> = HostCommandArgsById[I];

function requiredString(
  commandId: string,
  args: unknown,
  key: 'path' | 'version',
): string {
  const value = (args as Record<string, unknown> | undefined)?.[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${commandId}: missing { ${key} }`);
  }
  return value.trim();
}

export const hostCommandsExtension: AppExtension = {
  id: 'host-commands',
  version: '1.0.0',
  requires: ['commands'],
  setup(ctx) {
    const cleanups: Array<() => void> = [];

    cleanups.push(ctx.registerCommand({
      id: 'app.files.reveal',
      title: 'Reveal a file in the workbench',
      execute: (args) => {
        const path = requiredString('app.files.reveal', args, 'path');
        // Preserve the existing workbench file-preview handoff while also
        // exposing a typed AppHost event for standalone editor owners.
        publish('workbench:open-file', { path });
        ctx.bus.emit('files:reveal', { path });
        return { status: 'completed' as const, path };
      },
    }));

    cleanups.push(ctx.registerCommand({
      id: 'app.build.create',
      title: 'Create a game build',
      execute: (args) => {
        const version = requiredString('app.build.create', args, 'version');
        ctx.bus.emit('build:create', { version });
        return { status: 'completed' as const, version };
      },
    }));

    cleanups.push(ctx.registerCommand({
      id: 'app.build.play',
      title: 'Play a game build',
      execute: (args) => {
        const version = requiredString('app.build.play', args, 'version');
        ctx.bus.emit('build:play', { version });
        return { status: 'completed' as const, version };
      },
    }));

    return () => {
      for (const cleanup of cleanups.slice().reverse()) cleanup();
    };
  },
};
