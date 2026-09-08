export interface OverlayRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** Map a viewport-space rect onto a keep-alive overlay root's local coordinates. */
export function mapViewportRectToOverlayRoot(
  viewportRect: DOMRectReadOnly,
  overlayRoot: HTMLElement | null,
): OverlayRect {
  const origin = overlayRoot?.getBoundingClientRect();
  const ox = origin?.left ?? 0;
  const oy = origin?.top ?? 0;
  return {
    top: viewportRect.top - oy,
    left: viewportRect.left - ox,
    width: viewportRect.width,
    height: viewportRect.height,
  };
}

/**
 * WebView2 DPI/subpixel drift can slide the keep-alive canvas up over the
 * viewport PanelShell Play row. Shrink the overlay so it never covers that header.
 */
export function clampOverlayRectBelowHeader(
  mapped: OverlayRect,
  overlayRoot: HTMLElement | null,
  header: DOMRectReadOnly | null,
): OverlayRect {
  if (header === null || overlayRoot === null) return mapped;
  const origin = overlayRoot.getBoundingClientRect();
  const overlayTop = mapped.top + origin.top;
  const overlayLeft = mapped.left + origin.left;
  const overlayBottom = overlayTop + mapped.height;
  const overlayRight = overlayLeft + mapped.width;
  const intersects = overlayTop < header.bottom
    && overlayBottom > header.top
    && overlayLeft < header.right
    && overlayRight > header.left;
  if (!intersects) return mapped;
  const delta = header.bottom - overlayTop;
  if (delta <= 0 || delta >= mapped.height) return mapped;
  return { ...mapped, top: mapped.top + delta, height: mapped.height - delta };
}
