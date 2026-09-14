import { afterEach, expect, it } from 'bun:test';
import { useShellStore } from '../store';

const original = useShellStore.getState();
afterEach(() => useShellStore.setState(original, true));

it('keeps the visible provider and active-tab send routing consistent after sibling changes', () => {
  useShellStore.setState({ activeSid: 'a', providerOverride: 'forgeax', tabs: [
    { sid: 'a', agentId: 'forge', displayName: undefined, providerOverride: 'forgeax' },
    { sid: 'b', agentId: 'forge', displayName: undefined, providerOverride: 'other' },
  ] });
  window.dispatchEvent(new StorageEvent('storage', { key: 'forgeax.providerOverride', newValue: 'codex' }));
  const state = useShellStore.getState();
  expect(state.providerOverride).toBe('codex');
  expect(state.tabs.find((tab) => tab.sid === 'a')?.providerOverride).toBe('codex');
  expect(state.tabs.find((tab) => tab.sid === 'b')?.providerOverride).toBe('other');
});
