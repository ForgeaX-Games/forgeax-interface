import { expect, test } from "bun:test";

function runIsolated(source: string): void {
	const result = Bun.spawnSync([process.execPath, "--eval", source], {
		cwd: new URL("../..", import.meta.url).pathname,
		stdout: "pipe",
		stderr: "pipe",
		timeout: 15000,
	});
	expect(new TextDecoder().decode(result.stderr)).not.toContain(
		"AssertionError",
	);
	expect(result.exitCode).toBe(0);
}

test("public binding, legacy store and actual React consumers share product state without fallback side effects", () => {
	runIsolated(`
import './test/happydom.ts';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { createElement } from 'react';
import { act, render, cleanup } from '@testing-library/react';
localStorage.setItem('forgeax.tabs', 'untouched-product-marker');
let storageInstalls = 0;
const add = window.addEventListener.bind(window);
window.addEventListener = (type, listener, options) => {
  if (type === 'storage') storageInstalls++;
  return add(type, listener, options);
};
const { configureApplicationShellStore, createApplicationShellStoreContext, installApplicationOverlayRedirect, configureStudioDomainClients } = await import('./src/application');
const { configureSessionClient } = await import('./src/store-parts/session-client');
const { useShellStore, useAppStore } = await import('./src/store');
const before = storageInstalls;
const context = createApplicationShellStoreContext();
const sessionClient = { marker:'one' };
configureSessionClient(sessionClient);
assert.equal(context.getSessionClient(), sessionClient);
const replacementClient = { marker:'two' };
configureSessionClient(replacementClient);
assert.equal(context.getSessionClient(), replacementClient);
const projectClient = { marker:'project' };
configureStudioDomainClients({projects:projectClient});
assert.equal(context.getStudioProjectClient(), projectClient);
for (const key of ['getSurfaceWindowingController','setCurrentProject','resolveKernelForAgent','recordLog','reconcileSessionModelToActiveProvider','dropFileActivitySession']) assert.equal(typeof context[key], 'function');
const product = create((set) => ({ activeSid: 'one', activeOverlay: null, closeOverlay: () => set({activeOverlay:null}) }));
let constructions = 0;
const factory = () => { constructions++; return product; };
const captured = useAppStore.getState;
configureApplicationShellStore(factory);
configureApplicationShellStore(factory);
const View = () => createElement('span', null, useShellStore(s => s.activeSid));
const view = render(createElement(View));
assert.equal(view.container.textContent, 'one');
await act(async () => product.setState({activeSid:'two'}));
assert.equal(view.container.textContent, 'two');
await act(async () => useAppStore.setState({activeSid:'three'}));
assert.equal(view.container.textContent, 'three');
assert.equal(captured(), product.getState());
assert.equal(useAppStore, useShellStore);
assert.equal(useShellStore.getInitialState(), product.getInitialState());
let redirects = 0;
const stop = installApplicationOverlayRedirect('settings', () => redirects++);
product.setState({activeOverlay:'settings'});
assert.equal(redirects, 1);
assert.equal(product.getState().activeOverlay, null);
stop();
cleanup();
assert.equal(constructions, 1);
assert.equal(storageInstalls, before);
assert.equal(localStorage.getItem('forgeax.tabs'), 'untouched-product-marker');
assert.throws(() => configureApplicationShellStore(() => product));
process.exit(0);
`);
});

test("standalone first use preserves persistence, storage observations and one authority", () => {
	runIsolated(`
import './test/happydom.ts';
import assert from 'node:assert/strict';
localStorage.setItem('forgeax.tabs', 'legacy');
localStorage.setItem('forgeax.activeSid', 'persisted');
localStorage.setItem('forgeax.providerOverride', 'codex');
let storageInstalls = 0;
const add = window.addEventListener.bind(window);
window.addEventListener = (type, listener, options) => {
  if (type === 'storage') storageInstalls++;
  return add(type, listener, options);
};
const {useShellStore, useAppStore, configureApplicationShellStore} = await import('./src/store');
const before = storageInstalls;
assert.equal(localStorage.getItem('forgeax.tabs'), 'legacy');
const first = useShellStore.getState();
assert.equal(first.activeSid, 'persisted');
assert.equal(first.providerOverride, 'codex');
assert.equal(localStorage.getItem('forgeax.tabs'), null);
assert.equal(storageInstalls - before, 2);
assert.equal(useAppStore.getState(), first);
window.dispatchEvent(new StorageEvent('storage', {key:'forgeax.providerOverride',newValue:'claude-code'}));
assert.equal(useShellStore.getState().providerOverride, 'claude-code');
useShellStore.getState().setProviderOverride('codex');
assert.equal(localStorage.getItem('forgeax.providerOverride'), 'codex');
assert.equal(storageInstalls - before, 2);
assert.throws(() => configureApplicationShellStore(() => useShellStore));
process.exit(0);
`);
});
