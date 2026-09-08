import type { ReactNode } from 'react';
import { useTranslation } from '../../i18n';
import { useFloatingSurfaces } from '../../lib/platform';
import { DetachedPanelBoundary, SurfacePlaceholder } from '@forgeax/app-shell/react';
import type { DetachedWindowCapability } from '@forgeax/app-shell/window';

export function PanelWindowingBoundary({
  capability,
  children,
}: {
  capability?: DetachedWindowCapability;
  children: ReactNode;
}): ReactNode {
  const { t } = useTranslation();
  const floatingSurfaces = useFloatingSurfaces();

  return (
    <DetachedPanelBoundary
      capability={capability}
      floatingSurfaces={floatingSurfaces}
      placeholder={(
        <SurfacePlaceholder title={t('dockShell.detachedWindowPlaceholder')} />
      )}
    >
      {children}
    </DetachedPanelBoundary>
  );
}
