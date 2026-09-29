import { expect, test } from "bun:test";

test("public and legacy boot share the product authority and actual domain adapters", () => {
	const run = Bun.spawnSync(
		[
			process.execPath,
			"--eval",
			`
import './test/happydom.ts';
import assert from 'node:assert/strict';
import { configureApplicationUiActionBridge, bootApplicationUiActionBridge } from './src/application';
import { bootUiBridge } from './src/lib/ui-bridge';
import { useShellStore } from './src/store';
import { configureSessionClient } from './src/store-parts/session-client';
let subscription, context, boots = 0;
configureSessionClient({ onSessionEvent: (key, fn) => { subscription = { key, fn }; } });
useShellStore.setState({ activeSid: 'first' });
const product = ctx => { boots++; context = ctx; };
configureApplicationUiActionBridge(product);
bootApplicationUiActionBridge();
bootUiBridge();
assert.equal(boots, 1);
assert.equal(context.getActiveSid(), 'first');
const observed = [];
context.subscribeActiveSid(sid => observed.push(sid));
useShellStore.setState({ activeSid: 'second' });
assert.equal(observed.at(-1), 'second');
const received = [];
context.subscribeSessionEvents(event => received.push(event));
assert.equal(subscription.key, 'ui-bridge');
const event = { sid: 'second', event: { type: 'perception:query', payload: { kind: 'ui_snapshot' } } };
subscription.fn(event);
assert.equal(received[0], event);
for (const key of ['installPresentation', 'buildA11ySummary', 'captureUiScreenshot']) assert.equal(typeof context[key], 'function');
configureApplicationUiActionBridge(product);
assert.throws(() => configureApplicationUiActionBridge(() => {}));
console.log('public-ui-bridge-adapter-pass');
process.exit(0);
`,
		],
		{
			cwd: new URL("../..", import.meta.url).pathname,
			stdout: "pipe",
			stderr: "pipe",
			timeout: 15000,
		},
	);
	expect(new TextDecoder().decode(run.stderr)).not.toContain("AssertionError");
	expect(run.exitCode).toBe(0);
	expect(new TextDecoder().decode(run.stdout)).toContain(
		"public-ui-bridge-adapter-pass",
	);
});
