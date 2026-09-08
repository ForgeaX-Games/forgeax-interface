import type { AppHost } from '../../core/app-shell';
import { bumpDockResetEpoch } from '../DockShell/dockResetEpoch';

/** Latch a reset before the Page dock mounts. */
export function latchTourShellDefaults(): void {
  bumpDockResetEpoch();
}

/** Open the real project editor Page used by the tour and reset its layout. */
export function prepareTourShell(host: AppHost): void {
  void host.pages.open({ typeId: '@forgeax/editor#page/level' as Parameters<AppHost['pages']['open']>[0]['typeId'] })
    .then(() => host.commands.execute('app.dock.reset'))
    .catch(() => undefined);
}
