import { describe, expect, it } from 'bun:test';
import {
  isFooterPanelUserVisible,
  setFooterPanelUserVisible,
  subscribeFooterPanelVisibility,
} from './footer-panel-visibility';
import { FOOTER_PANEL_ID_LIST } from './footer-panels';

describe('footer panel user visibility', () => {
  it('defaults footer chrome to visible', () => {
    for (const id of FOOTER_PANEL_ID_LIST) {
      expect(isFooterPanelUserVisible(id)).toBe(true);
    }
  });

  it('tracks hide/show intent and notifies subscribers', () => {
    let revision = 0;
    const dispose = subscribeFooterPanelVisibility(() => { revision += 1; });
    setFooterPanelUserVisible('info', false);
    expect(isFooterPanelUserVisible('info')).toBe(false);
    expect(revision).toBe(1);
    setFooterPanelUserVisible('info', true);
    expect(isFooterPanelUserVisible('info')).toBe(true);
    expect(revision).toBe(2);
    dispose();
  });

  it('ignores non-footer panel ids', () => {
    expect(() => setFooterPanelUserVisible('viewport', false)).not.toThrow();
    expect(isFooterPanelUserVisible('viewport')).toBe(true);
  });
});
