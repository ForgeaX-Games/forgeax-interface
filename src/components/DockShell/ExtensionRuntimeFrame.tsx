import { useCallback, useEffect, useRef, type ReactElement, type SyntheticEvent } from 'react';
import type { ExtensionCatalogEntry } from '@forgeax/extension-host/browser';
import type { ExtensionSessionContext } from '@forgeax/extension-host/contracts';
import { ExtensionFrame } from '@forgeax/extension-host/react';
import { getLocale } from '@/i18n';
import type { SurfacePane } from '@forgeax/app-shell/window';
import type {
  EditorAssetImportSourceHandler,
} from './panelRenderers';
import { attachExtensionEditorAssetImportBridge } from './extension-editor-bridge';
import { EXTENSION_API_BASE } from './extensionRuntime';

export const TRUSTED_EXTENSION_SANDBOX = 'allow-scripts allow-same-origin';

export function extensionRuntimeUrl(
  runtimeUrl: string,
  pane?: SurfacePane,
): string {
  if (!pane) return runtimeUrl;
  const url = new URL(runtimeUrl, window.location.href);
  url.searchParams.set('pane', pane);
  return url.origin === window.location.origin
    ? `${url.pathname}${url.search}${url.hash}`
    : url.toString();
}

export function extensionFrameContext(
  descriptor: ExtensionCatalogEntry,
  gameId: string,
): ExtensionSessionContext {
  const runtimeId = encodeURIComponent(descriptor.runtimeId);
  const encodedGameId = encodeURIComponent(gameId);
  return {
    extensionId: descriptor.extensionId,
    runtimeId: descriptor.runtimeId,
    gameId,
    locale: getLocale(),
    theme: 'dark',
    endpoints: {
      toolCall: `${EXTENSION_API_BASE}tools/call`,
      gamePackage: `${EXTENSION_API_BASE}games/${encodedGameId}/package?runtimeId=${runtimeId}`,
      extensionApi: `${EXTENSION_API_BASE}extension/${runtimeId}?gameId=${encodedGameId}`,
      gameVersions: `${EXTENSION_API_BASE}games/${encodedGameId}/versions`,
      gameComponents: `${EXTENSION_API_BASE}games/${encodedGameId}/components`,
    },
    capabilities: ['tools.call', 'project.files', 'game.package', 'media', 'versioning', 'extension.http'],
  };
}

export function ExtensionRuntimeFrame({
  descriptor,
  gameId,
  pane,
  onEditorAssetImport,
}: {
  descriptor: ExtensionCatalogEntry;
  gameId: string;
  pane?: SurfacePane;
  onEditorAssetImport?: EditorAssetImportSourceHandler;
}): ReactElement {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const importHandlerRef = useRef(onEditorAssetImport);
  importHandlerRef.current = onEditorAssetImport;

  const onFrameLoad = useCallback((event: SyntheticEvent<HTMLIFrameElement>) => {
    frameRef.current = event.currentTarget;
  }, []);

  useEffect(() => {
    return attachExtensionEditorAssetImportBridge({
      ownerWindow: window,
      frameWindow: () => frameRef.current?.contentWindow ?? null,
      importAssetSource: (request) => {
        const handler = importHandlerRef.current;
        return handler
          ? handler(request)
          : { ok: false, error: '当前 Studio 没有可用的 Editor Gateway' };
      },
    });
  }, []);

  return (
    <ExtensionFrame
      runtimeUrl={extensionRuntimeUrl(descriptor.runtimeUrl, pane)}
      context={extensionFrameContext(descriptor, gameId)}
      sandbox={TRUSTED_EXTENSION_SANDBOX}
      title={pane ? `${descriptor.title} — ${pane}` : descriptor.title}
      data-extension-runtime={descriptor.extensionId}
      data-extension-pane={pane}
      style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
      onLoad={onFrameLoad}
    />
  );
}
