import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./recent-games.ts", import.meta.url));
const clients = fileURLToPath(
	new URL("../store-parts/domain-clients.ts", import.meta.url),
);
for (const scenario of ["clean", "subscribed", "pending", "cached"] as const) {
	test(`recent-project binding preserves ${scenario} authority`, () => {
		const script = `
      import assert from 'node:assert/strict';
      const m = await import(${JSON.stringify(source)});
      const c = await import(${JSON.stringify(clients)});
      assert.equal(typeof m.configureRecentProjectsRuntime, 'function');
      assert.throws(() => m.configureRecentProjectsRuntime(undefined), /Invalid recent-project/);
      const rows = [{ slug: 'product', mtime: 42 }];
      let changes = 0;
      let callback;
      const runtime = { read: limit => rows.slice(0, limit), getRevision: () => changes, subscribe: fn => { callback = fn; return () => { callback = undefined; }; }, warm: async () => { changes++; callback?.(); } };
      const configureClient = (listProjects) => c.configureStudioDomainClients({ agents: null, builds: null, projects: { listProjects } });
      if (${JSON.stringify(scenario)} === 'subscribed') {
        const off = m.subscribeRecentGames(() => {});
        assert.throws(() => m.configureRecentProjectsRuntime(runtime), /before cache use/);
        off();
      }
      if (${JSON.stringify(scenario)} === 'pending') {
        let release;
        configureClient(() => new Promise(resolve => { release = resolve; }));
        const warming = m.warmRecentGames();
        assert.throws(() => m.configureRecentProjectsRuntime(runtime), /before cache use/);
        release({ games: [{ slug: 'fallback' }] });
        await warming;
        assert.equal(m.getRecentGames()[0].slug, 'fallback');
        assert.throws(() => m.configureRecentProjectsRuntime(runtime), /before cache use/);
      } else if (${JSON.stringify(scenario)} === 'cached') {
        configureClient(async () => ({ games: [] }));
        await m.warmRecentGames();
        assert.equal(m.getRecentGamesRevision(), 0);
        assert.throws(() => m.configureRecentProjectsRuntime(runtime), /before cache use/);
      } else {
        assert.throws(() => m.configureRecentProjectsRuntime({}), /Invalid recent-project/);
        assert.equal(m.getRecentGamesRevision(), 0);
        m.configureRecentProjectsRuntime(runtime);
        m.configureRecentProjectsRuntime(runtime);
        assert.throws(() => m.configureRecentProjectsRuntime({ ...runtime }), /already configured/);
        let notifications = 0;
        const off = m.subscribeRecentGames(() => { notifications++; });
        await m.warmRecentGames();
        assert.equal(m.getRecentGamesRevision(), 1);
        assert.equal(m.getRecentGames()[0], rows[0]);
        assert.deepEqual(m.getRecentGames(0), []);
        assert.equal(notifications, 1);
        off();
        await m.warmRecentGames();
        assert.equal(notifications, 1);
        assert.equal(m.getRecentGamesRevision(), 2);
      }
    `;
		const result = Bun.spawnSync([process.execPath, "--eval", script], {
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(new TextDecoder().decode(result.stderr)).toBe("");
		expect(result.exitCode).toBe(0);
	});
}
