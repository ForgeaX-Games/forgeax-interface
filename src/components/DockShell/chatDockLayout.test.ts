import { describe, expect, it } from 'bun:test';
import { readChatDockviewLayoutSize } from './chatDockLayout';

describe('readChatDockviewLayoutSize', () => {
  it('measures the dockview box, not the outer column or fixed-width inner shell', () => {
    const inner = document.createElement('div');
    const sessionTabs = document.createElement('div');
    const reactHost = document.createElement('div');
    const dockviewView = document.createElement('div');
    const dockview = document.createElement('div');
    dockview.className = 'fx-dockshell';
    dockviewView.className = 'dv-view visible';
    dockviewView.append(dockview);
    reactHost.append(dockviewView);
    inner.append(sessionTabs, reactHost);

    Object.defineProperties(inner, {
      clientWidth: { value: 360 },
      clientHeight: { value: 720 },
    });
    Object.defineProperties(dockview, {
      clientWidth: { value: 360 },
      clientHeight: { value: 676 },
    });

    expect(readChatDockviewLayoutSize(inner)).toEqual({ width: 360, height: 676 });
  });

  it('returns null until the dockview has a measurable box', () => {
    const inner = document.createElement('div');
    const dockview = document.createElement('div');
    dockview.className = 'fx-dockshell';
    inner.append(dockview);

    expect(readChatDockviewLayoutSize(inner)).toBeNull();
    expect(readChatDockviewLayoutSize(null)).toBeNull();
  });
});
