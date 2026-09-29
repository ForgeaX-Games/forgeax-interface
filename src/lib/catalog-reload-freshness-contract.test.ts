import { expect, test } from "bun:test";

// Each child gets a fresh real shared-cache module. No production cache reset
// seam or process-global fetch/EventSource mutation leaks into other tests.
for (const scenario of ["fresh-cache", "preceding-inflight"]) {
	test(`catalog reload reads authoritative state despite ${scenario}`, () => {
		const result = Bun.spawnSync(
			[
				process.execPath,
				"--preload",
				"./test/happydom.ts",
				"-e",
				`
      import { strict as assert } from 'node:assert';
      import { createCatalogPageExtensionRuntime } from './src/core/app-shell/catalog-page-extensions';
      import { listExtensionsShared } from './src/lib/extension-api';

      let reload;
      let closed = false;
      globalThis.EventSource = class {
        constructor(url) { assert.equal(url, '/api/events/stream?topic=plugin.reloaded'); }
        addEventListener(name, listener) { assert.equal(name, 'event'); reload = listener; }
        close() { closed = true; }
      };
      const item = {
        id: '@forgeax-extension/counter', version: '1.0.0', kind: 'extension', displayName: 'Counter',
        contributes: { pages: [{ id: 'counter', title: 'Counter', cardinality: 'singleton',
          restorePolicy: 'project', layoutVersion: 2, panels: [],
          layout: { version: 2, root: { kind: 'tabs', placements: [] } } }] },
      };
      const before = { kind: null, count: 1, generation: 1, items: [item] };
      const after = { kind: null, count: 0, generation: 2, items: [] };
      let server = before;
      let requests = 0;
      let holdNext = false;
      let releaseOld;
      const response = (data) => Response.json(data);
      globalThis.fetch = async () => {
        requests++;
        const snapshot = server;
        if (holdNext) {
          holdNext = false;
          return await new Promise(resolve => { releaseOld = () => resolve(response(snapshot)); });
        }
        return response(snapshot);
      };
      // Prime the real two-second shared cache before runtime startup.
      await listExtensionsShared({ force: true });
      const mounted = new Set();
      const runtime = createCatalogPageExtensionRuntime({
        overriddenIds: new Set(),
        control: { contributePagePlatform(id) {
          mounted.add(id); return () => { mounted.delete(id); };
        } },
      });
      await runtime.start();
      assert.equal(mounted.size, 1);
      let oldRequest;
      if (${JSON.stringify(scenario)} === 'preceding-inflight') {
        holdNext = true;
        oldRequest = listExtensionsShared({ force: true });
        assert.equal(typeof releaseOld, 'function');
      }
      const precedingRequests = requests;
      server = after;
      reload(new Event('event'));
      // Let the serialized refresh consume the event; no explicit refresh or
      // clock advancement may rescue a dropped notification.
      await new Promise(resolve => setTimeout(resolve, 20));
      if (oldRequest) { releaseOld(); await oldRequest; }
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(requests, precedingRequests + 1, 'reload must fetch after the event');
      assert.equal(mounted.size, 0, 'removed contribution must not survive a stale response');
      await runtime.dispose();
      assert.equal(closed, true);
      `,
			],
			{
				cwd: new URL("../../", import.meta.url).pathname,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		expect(new TextDecoder().decode(result.stderr)).toBe("");
		expect(result.exitCode).toBe(0);
	});
}
