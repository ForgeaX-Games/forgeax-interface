// packages/interface/src/core/app-shell/derive-panel-renderers.ts
//
// The fold from contribution entries to the PanelRenderers view — ADR 0025
// M2's "manifestToPanelRenderers" direction: the ContributionRegistry is the
// SSOT; host.panels is a memoized snapshot of this pure function.
//
// Merge semantics are owned by the public @forgeax/app-shell contract:
//   - object fields (overlays / surfaces / chrome / detached / slots /
//     extensionTransport / panels / extensionPanels / editor / builtinPageLayouts):
//     one-level sub-merge — later patches win per sub-key, siblings preserved
//   - array fields (editorPanelIds): whole-value REPLACE
//   - undefined patch fields: skipped
//   - `base` and patch objects are never mutated (copy-on-write per field)
import { deriveShellSnapshot, type ShellSnapshotPatch } from '@forgeax/app-shell';
import type { PanelRenderers } from '../../components/DockShell/panelRenderers';

export function derivePanelRenderers(
  base: PanelRenderers,
  patches: ReadonlyArray<Partial<PanelRenderers>>,
): PanelRenderers {
  type ShellRecord = Record<string, unknown>;

  return deriveShellSnapshot(
    base as unknown as ShellRecord,
    patches as unknown as ReadonlyArray<ShellSnapshotPatch<ShellRecord>>,
  ) as unknown as PanelRenderers;
}
