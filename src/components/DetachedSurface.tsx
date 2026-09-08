/**
 * DetachedSurface — the root rendered inside a detached OS window.
 *
 * A detached window loads the SAME bundle as the main shell but with
 * `?surface=...` in its URL. `main.tsx` decodes it and mounts this instead of
 * the full <App>, so the window shows ONLY the requested surface (today: a
 * plugin iframe). It reuses <StandaloneExtensionIframe> verbatim — the iframe is
 * always `active` here because the whole OS window IS the visibility (no
 * keep-alive hiding needed at this level).
 *
 * Business state stays consistent with the main window because both talk to
 * the same backend (/api, /ws) — no cross-window state plumbing required.
 */
import type { ReactElement } from 'react';
import {
  DetachedSurfaceFrame,
  DetachedSurfaceStatus,
  SurfacePlaceholder,
  SurfaceRegion,
} from '@forgeax/app-shell/react';
import type { SurfaceDescriptor } from '@forgeax/app-shell/window';
import { useTranslation } from '@/i18n';
import { useExtensionManifest } from '../lib/use-extension-manifest';
import { StandaloneExtensionIframe } from './MainArea/StandaloneExtensionIframe';
import { ConsolePanel } from './MainArea/ConsolePanel';
import { TelemetryViewer } from './MainArea/TelemetryViewer';
import { Sidebar } from './Sidebar/Sidebar';
import { MainArea } from './MainArea/MainArea';
import { usePanelRenderers } from './DockShell/panelRenderers';
import { FatalBanner } from './StatusBar/FatalBanner';
import { PanelShell } from './PanelShell/PanelShell';

interface Props {
  surface: SurfaceDescriptor;
}

export function DetachedSurface({ surface }: Props): ReactElement {
  if (surface.kind === 'plugin') {
    return <DetachedExtensionSurface surface={surface} />;
  }
  return <DetachedPanelSurface surface={surface} />;
}

/** Built-in panels (agents / files / chat) hosted in their own OS window. All
 *  are fully store-driven (no props), and main.tsx has booted the store +
 *  streams for this window, so they render & stay live like in the main shell.
 *  Wrapped full-bleed since they normally live inside a sized layout slot. */
function DetachedPanelSurface({ surface }: Props): ReactElement {
  const { t } = useTranslation();
  const renderers = usePanelRenderers();
  const chatDescriptor = renderers.panels?.chat;
  const viewportDescriptor = renderers.panels?.viewport;
  const SceneEditor = renderers.surfaces?.SceneEditor;
  const AgentsBrowser = renderers.detached?.AgentsBrowser;
  const FilesBrowser = renderers.detached?.FilesBrowser;
  let body: ReactElement;
  switch (surface.id) {
    case 'chat':
      // chat is the standalone @forgeax/chat application injected via panels['chat'] (R4); a
      // detached chat window has no keep-alive layer so render it directly.
      body = (
        <>
          {chatDescriptor ? (
            <div data-fx-slot="DockPanel:chat" style={{ display: 'contents' }}>{chatDescriptor.render()}</div>
          ) : (
            <NoEditorBody />
          )}
        </>
      );
      break;
    case 'agents':
      // Studio injects detached.AgentsBrowser from the chat application.
      body = (
        <>
          {AgentsBrowser ? (
            <div data-fx-slot="AgentsBrowser" style={{ display: 'contents' }}><AgentsBrowser /></div>
          ) : (
            <NoEditorBody />
          )}
        </>
      );
      break;
    case 'files':
      // Studio injects detached.FilesBrowser from the resource editor.
      body = (
        <>
          {FilesBrowser ? (
            <div data-fx-slot="FilesBrowser" style={{ display: 'contents' }}><FilesBrowser /></div>
          ) : (
            <NoEditorBody />
          )}
        </>
      );
      break;
    // DockShell panels popped into their own OS window (design §0.2.2 / #10).
    case 'console':
      body = <ConsolePanel />;
      break;
    case 'telemetry':
      body = <TelemetryViewer />;
      break;
    case 'tools':
      body = <Sidebar />;
      break;
    case 'main':
      body = <MainArea />;
      break;
    // Viewport panel — detach the WHOLE panel, including its shared PanelShell
    // header. The SceneEditor remains a pure renderer surface; operation controls
    // must never be injected into the game-view content as a detached-only fallback.
    // Detached windows have no keep-alive layer, so replace the descriptor's docked
    // anchor body with the real surface while preserving the same panel chrome.
    // 2026-06-30: 'preview'/'edit' merged into single 'viewport' panel.
    case 'viewport':
    case 'edit': // legacy backward compat
    case 'preview': // legacy backward compat
      body = (
        <PanelShell
          id="viewport"
          panel={{
            title: 'Viewport',
            header: { visible: true, showTitle: false },
            content: { padding: 'none', scroll: 'none', tone: 'tool' },
            dockChrome: { singleTab: 'hideTitle' },
            ...viewportDescriptor,
            render: () => (
              <SurfaceRegion overlay={<FatalBanner source="edit" />}>
                {SceneEditor ? (
                  <div data-fx-slot="SceneEditor" style={{ display: 'contents' }}><SceneEditor /></div>
                ) : (
                  <NoEditorBody />
                )}
              </SurfaceRegion>
            ),
          }}
        />
      );
      break;
    default: {
      const editorPanelId = surface.id.startsWith('ep:') ? surface.id.slice(3) : null;
      const editorPanel = editorPanelId ? renderers.panels?.[editorPanelId] : undefined;
      if (!editorPanelId || !editorPanel) {
        return (
          <DetachedSurfaceFrame centered>
            <DetachedSurfaceStatus>{t('detachedSurface.unknownPanel', { id: surface.id })}</DetachedSurfaceStatus>
          </DetachedSurfaceFrame>
        );
      }
      body = <PanelShell id={surface.id} panel={editorPanel} />;
      break;
    }
  }
  return (
    <DetachedSurfaceFrame panel>
      {body}
    </DetachedSurfaceFrame>
  );
}

function DetachedExtensionSurface({ surface }: Props): ReactElement {
  const { t } = useTranslation();
  const manifest = useExtensionManifest(surface.id);

  if (manifest === 'loading') {
    return (
      <DetachedSurfaceFrame centered>
        <DetachedSurfaceStatus>{t('detachedSurface.loadingExtension', { id: surface.id })}</DetachedSurfaceStatus>
      </DetachedSurfaceFrame>
    );
  }
  if (!manifest) {
    return (
      <DetachedSurfaceFrame centered>
        <DetachedSurfaceStatus tone="error">{t('detachedSurface.extensionNotFound', { id: surface.id })}</DetachedSurfaceStatus>
      </DetachedSurfaceFrame>
    );
  }

  return (
    <DetachedSurfaceFrame>
      <StandaloneExtensionIframe plugin={manifest} pane={surface.pane} active />
    </DetachedSurfaceFrame>
  );
}

function NoEditorBody(): ReactElement {
  return <SurfacePlaceholder title="No editor configured" />;
}
