import { lazy, Suspense } from 'react';
import { useTranslation } from '@/i18n';
import { pickLang } from '../../lib/extension-api';
import { useExtensionManifest } from '../../lib/use-extension-manifest';
import type { SurfacePane } from '@forgeax/app-shell/window';
import { useShellStore } from '../../store';
import { usePanelRenderers } from './panelRenderers';
import { ExtensionRuntimeFrame } from './ExtensionRuntimeFrame';
import { isExtensionHostExtension, useExtensionCatalogEntry } from './extensionRuntime';
import { usesExternalIframeRuntime } from './extension-runtime-selection';
import { NativeExtensionHost } from '../ExtensionHost/NativeExtensionHost';

// Keep Extension Platform transport out of standalone DockShell's static import graph. Catalog
// Pages load this runtime only when an iframe-backed placement is mounted.
const StandaloneExtensionIframe = lazy(() =>
  import('../MainArea/StandaloneExtensionIframe').then((module) => ({
    default: module.StandaloneExtensionIframe,
  })),
);

interface Props {
  extensionId: string;
  pane?: SurfacePane;
}

function LegacyStandalonePanel({
  manifest,
  pane,
}: {
  manifest: Exclude<ReturnType<typeof useExtensionManifest>, null | 'loading'>;
  pane?: SurfacePane;
}) {
  const { t } = useTranslation();
  return (
    <div className="page-dock-panel page-dock-standalone">
      <Suspense fallback={<div className="page-dock-loading">{t('extensionDock.loadingExtensionGeneric')}</div>}>
        <StandaloneExtensionIframe plugin={manifest} pane={pane} active />
      </Suspense>
    </div>
  );
}

function HostedExtensionRuntimePanel({
  extensionId,
  pane,
  onEditorAssetImport,
}: {
  extensionId: string;
  pane?: SurfacePane;
  onEditorAssetImport?: import('./panelRenderers').EditorAssetImportSourceHandler;
}) {
  const { t } = useTranslation();
  const activeGameSlug = useShellStore((state) => state.activeGameSlug);
  const activeGameResolved = useShellStore((state) => state.activeGameResolved);
  const runtime = useExtensionCatalogEntry(extensionId, activeGameSlug, activeGameResolved);

  if (runtime.loading) {
    return <div className="page-dock-loading">{t('extensionDock.loadingExtensionHost')}</div>;
  }
  if (runtime.error) {
    return (
      <div className="page-dock-loading page-dock-error" role="alert">
        <div>{t('extensionDock.extensionHostFailed', { error: runtime.error.message })}</div>
        <button type="button" onClick={runtime.retry}>{t('extensionDock.retry')}</button>
      </div>
    );
  }
  if (runtime.descriptor && activeGameSlug) {
    return (
      <div className="page-dock-panel page-dock-standalone">
        <ExtensionRuntimeFrame
          descriptor={runtime.descriptor}
          gameId={activeGameSlug}
          pane={pane}
          onEditorAssetImport={onEditorAssetImport}
        />
      </div>
    );
  }
  return (
    <div className="page-dock-loading page-dock-error" role="alert">
      <div>
        {activeGameSlug
          ? t('extensionDock.extensionExtensionMissing', { extensionId })
          : t('extensionDock.extensionGameRequired')}
      </div>
      <button type="button" onClick={runtime.retry}>{t('extensionDock.retry')}</button>
    </div>
  );
}

/** Render one Page placement for a Extension extension. The Page owns panel
 * availability and position; `pane` only selects the extension's content mode. */
export function ExtensionHostPanel({ extensionId, pane }: Props) {
  const { t, i18n } = useTranslation();
  const manifest = useExtensionManifest(extensionId);
  const { extensionPanels, editor } = usePanelRenderers();

  const InlinePanel = extensionPanels?.[extensionId];
  if (InlinePanel) {
    return (
      <div className="page-dock-panel page-dock-inline">
        <InlinePanel />
      </div>
    );
  }

  if (!manifest || manifest === 'loading') {
    return (
      <div className="page-dock-panel">
        <div className="page-dock-loading">{t('extensionDock.loadingExtension', { extensionId })}</div>
      </div>
    );
  }

  const label = pickLang(manifest.displayName, i18n.language, manifest.id);
  if (
    manifest.runtimeMode === 'native-module'
    && manifest.moduleUrl
  ) {
    return (
      <div className="page-dock-panel page-dock-standalone">
        <NativeExtensionHost
          extensionId={manifest.id}
          moduleUrl={manifest.moduleUrl}
          allowedOrigin={manifest.allowedOrigin}
          generation={manifest.registryGeneration ?? 0}
          active
        />
      </div>
    );
  }
  // Explicit legacy runtimes are iframe-backed even though their persisted Studio
  // manifest intentionally contains no standalone process command/port. The
  // Host-projected frontendUrl is the authority for this externally-owned mode.
  if (usesExternalIframeRuntime(manifest)) {
    if (!isExtensionHostExtension(manifest.id)) {
      return <LegacyStandalonePanel manifest={manifest} pane={pane} />;
    }
    return (
      <HostedExtensionRuntimePanel
        extensionId={extensionId}
        pane={pane}
        onEditorAssetImport={editor?.importAssetSource}
      />
    );
  }

  const description = pickLang(manifest.description ?? '', i18n.language, '');
  return (
    <div className="page-dock-panel page-dock-placeholder">
      <div className="page-dock-name">{label}</div>
      {description && <div className="page-dock-desc">{description}</div>}
      <div className="page-dock-id">{manifest.id}</div>
    </div>
  );
}
