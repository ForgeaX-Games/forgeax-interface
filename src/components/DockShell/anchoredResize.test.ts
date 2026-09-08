import { describe, expect, it } from 'bun:test';
import { applyAnchoredResizeDelta, beginAnchoredResize } from './anchoredResize';

const clamp = (value: number): number => Math.min(720, Math.max(280, value));

describe('anchored shell resize', () => {
  it('stays pinned after max overshoot until the pointer returns inside the boundary', () => {
    const session = beginAnchoredResize(600);

    expect(clamp(applyAnchoredResizeDelta(session, -200))).toBe(720);
    expect(clamp(applyAnchoredResizeDelta(session, 1))).toBe(720);
    expect(clamp(applyAnchoredResizeDelta(session, 79))).toBe(720);
    expect(clamp(applyAnchoredResizeDelta(session, 1))).toBe(719);
  });

  it('stays pinned after min overshoot until the pointer returns inside the boundary', () => {
    const session = beginAnchoredResize(360);

    expect(clamp(applyAnchoredResizeDelta(session, 100))).toBe(280);
    expect(clamp(applyAnchoredResizeDelta(session, -1))).toBe(280);
    expect(clamp(applyAnchoredResizeDelta(session, -19))).toBe(280);
    expect(clamp(applyAnchoredResizeDelta(session, -1))).toBe(281);
  });
});
