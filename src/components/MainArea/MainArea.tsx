import { ShellSlot } from '@forgeax/app-shell/react';
import { ViewportPanel } from './SurfacePanels';
import { usePanelRenderers } from '../DockShell/panelRenderers';
import './MainArea.css';

// 2026-05-17 — Bus mode tab + BusAdminPanel render here removed.
// Bus inventory is now a "Plugins" section inside SettingsPanel (overlay,
// opened via gear icon).
// 2026-06-30: 'preview'/'edit' merged into single 'viewport' mode.
// 2026-07-08 (v9): Editor Page id renamed 'edit' → 'scene'.
export function MainArea() {
  // MainArea body is a product Page injected through slots.MainAreaBody.
  const MainAreaBody = usePanelRenderers().slots?.MainAreaBody;
  // The 'main' dock panel exists ONLY in the legacy AI layout (Scene uses a
  // separate 'viewport' panel), so its body is always AI content. The
  // `activeId === 'scene'` ViewportPanel branch is only a fallback for
  // interface-alone hosts that inject no MainAreaBody. Derives directly from the
  // active Page (the single source of truth) — no separate mode field.
  return (
    <main className="main-area">
      {MainAreaBody ? (
        <ShellSlot name="MainAreaBody" style={{ display: 'contents' }}>
          <MainAreaBody />
        </ShellSlot>
      ) : <ViewportPanel />}
    </main>
  );
}
