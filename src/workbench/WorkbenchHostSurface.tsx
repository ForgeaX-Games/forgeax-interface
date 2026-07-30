import type { CSSProperties, ReactElement } from 'react';
import type { WorkbenchCatalogEntry } from '@forgeax/workbench-host/browser';
import { WorkbenchFrame } from '@forgeax/workbench-host/react';
import { X } from 'lucide-react';
import { useShellStore } from '../store';
import {
  sharedWorkbenchSelectionExtensionId,
  useSharedWorkbenchCatalog,
  WORKBENCH_API_BASE,
} from './catalog';

export const TRUSTED_WORKBENCH_SANDBOX = 'allow-scripts allow-same-origin';

interface PaneDescriptor {
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly width?: number;
  readonly scrollable?: boolean;
}

interface WorkbenchPanes {
  readonly left?: PaneDescriptor;
  readonly center?: PaneDescriptor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function panesOf(descriptor: WorkbenchCatalogEntry): WorkbenchPanes {
  return isRecord(descriptor.panes) ? descriptor.panes as WorkbenchPanes : {};
}

function dimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function paneStyle(pane: PaneDescriptor | undefined): CSSProperties {
  return {
    inlineSize: dimension(pane?.width),
    minInlineSize: dimension(pane?.minWidth) ?? 0,
    minBlockSize: dimension(pane?.minHeight) ?? 0,
    overflow: pane?.scrollable === false ? 'hidden' : 'auto',
  };
}

function withPane(runtimeUrl: string, pane: 'left' | 'center'): string {
  const url = new URL(runtimeUrl, window.location.href);
  url.searchParams.set('pane', pane);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function workbenchFrameContext(
  descriptor: WorkbenchCatalogEntry,
  gameId: string,
) {
  const base = WORKBENCH_API_BASE;
  const runtimeId = encodeURIComponent(descriptor.runtimeId);
  const encodedGameId = encodeURIComponent(gameId);
  return {
    extensionId: descriptor.extensionId,
    runtimeId: descriptor.runtimeId,
    gameId,
    locale: document.documentElement.lang.trim() || navigator.language || 'en',
    theme: 'dark' as const,
    endpoints: {
      toolCall: `${base}tools/call`,
      gamePackage: `${base}games/${encodedGameId}/package?runtimeId=${runtimeId}`,
      extensionApi: `${base}extension/${runtimeId}?gameId=${encodedGameId}`,
      gameVersions: `${base}games/${encodedGameId}/versions`,
      gameComponents: `${base}games/${encodedGameId}/components`,
    },
    capabilities: ['workbench'],
  };
}

function Frame({
  descriptor,
  gameId,
  runtimeUrl,
  title,
}: {
  descriptor: WorkbenchCatalogEntry;
  gameId: string;
  runtimeUrl: string;
  title: string;
}): ReactElement {
  return (
    <WorkbenchFrame
      runtimeUrl={runtimeUrl}
      context={workbenchFrameContext(descriptor, gameId)}
      sandbox={TRUSTED_WORKBENCH_SANDBOX}
      title={title}
      style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
    />
  );
}

export function WorkbenchHostSurface({
  descriptor,
  gameId,
}: {
  descriptor: WorkbenchCatalogEntry;
  gameId: string;
}): ReactElement {
  if (descriptor.surface !== 'split') {
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <Frame
          descriptor={descriptor}
          gameId={gameId}
          runtimeUrl={descriptor.runtimeUrl}
          title={descriptor.title}
        />
      </div>
    );
  }
  const panes = panesOf(descriptor);
  return (
    <div
      data-workbench-surface="split"
      style={{ display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}
    >
      <div
        data-workbench-pane="left"
        style={{
          ...paneStyle(panes.left),
          flexGrow: 0,
          flexShrink: 1,
          flexBasis: dimension(panes.left?.width) ?? '38%',
        }}
      >
        <Frame
          descriptor={descriptor}
          gameId={gameId}
          runtimeUrl={withPane(descriptor.runtimeUrl, 'left')}
          title={`${descriptor.title} — left`}
        />
      </div>
      <div
        data-workbench-pane="center"
        style={{ ...paneStyle(panes.center), flexGrow: 1, flexShrink: 1, flexBasis: 'auto' }}
      >
        <Frame
          descriptor={descriptor}
          gameId={gameId}
          runtimeUrl={withPane(descriptor.runtimeUrl, 'center')}
          title={`${descriptor.title} — center`}
        />
      </div>
    </div>
  );
}

/** First-class MainArea page backed by the shared Host catalog. */
export function SharedWorkbenchHostLayer(): ReactElement | null {
  const selectedId = useShellStore((state) => state.workbenchExpandedExtensionId);
  const setSelectedId = useShellStore((state) => state.setWorkbenchExpandedExtensionId);
  const pinnedSlug = useShellStore((state) => state.pinnedSlug);
  const catalog = useSharedWorkbenchCatalog(pinnedSlug);
  const selectedExtensionId = sharedWorkbenchSelectionExtensionId(selectedId);
  const descriptor = catalog.entries.find((entry) => entry.extensionId === selectedExtensionId);

  if (!descriptor || !catalog.gameId) return null;
  return (
    <div className="fx-center-plugin-layer active" data-shared-workbench={descriptor.extensionId}>
      <div className="wb-plugin-host-bar fx-plugin-head">
        <span className="fx-plugin-head-ico" aria-hidden>{descriptor.icon ?? '◫'}</span>
        <div className="fx-plugin-head-meta">
          <div className="fx-plugin-head-title">{descriptor.title}</div>
          <div className="fx-plugin-head-sub">{descriptor.extensionId}</div>
        </div>
        <span className="fx-plugin-head-tag">Workbench</span>
        <button
          className="fx-plugin-head-close"
          type="button"
          onClick={() => setSelectedId(null)}
          title="Close"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
      <div className="fx-center-plugin-body">
        <WorkbenchHostSurface descriptor={descriptor} gameId={catalog.gameId} />
      </div>
    </div>
  );
}
