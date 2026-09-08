import { describe, expect, it } from 'bun:test';
import { FOOTER_PANEL_ID_LIST, FOOTER_PANEL_IDS } from './footer-panels';

describe('footer chrome SSOT', () => {
  it('keeps the ordered footer panel list and membership set aligned', () => {
    expect(FOOTER_PANEL_ID_LIST).toEqual(['ep:assets', 'info', 'checkpoints', 'events']);
    expect(new Set(FOOTER_PANEL_IDS)).toEqual(new Set(FOOTER_PANEL_ID_LIST));
  });
});
