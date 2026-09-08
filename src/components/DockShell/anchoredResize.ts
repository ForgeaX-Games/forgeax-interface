export interface AnchoredResizeSession {
  readonly startWidth: number;
  totalDelta: number;
}

export function beginAnchoredResize(startWidth: number): AnchoredResizeSession {
  return { startWidth, totalDelta: 0 };
}

export function applyAnchoredResizeDelta(
  session: AnchoredResizeSession,
  delta: number,
): number {
  session.totalDelta += delta;
  return session.startWidth - session.totalDelta;
}
