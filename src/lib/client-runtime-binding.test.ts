import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

for (const kind of ["session", "domain"] as const) {
	test(`${kind} client runtime replacement preserves the current value and failed binding`, () => {
		const path = fileURLToPath(
			new URL(
				`../store-parts/${kind}-client${kind === "domain" ? "s" : ""}.ts`,
				import.meta.url,
			),
		);
		// A fresh process keeps these singleton configurations out of other tests.
		const script = `
      import assert from 'node:assert/strict';
      const module = await import(${JSON.stringify(path)});
      const domain = ${kind === "domain"};
      const configure = domain ? module.configureStudioDomainClients : module.configureSessionClient;
      const bind = domain ? module.configureStudioDomainClientRuntime : module.configureSessionClientRuntime;
      const get = domain ? module.getStudioProjectClient : module.getSessionClient;
      const has = domain ? module.hasStudioDomainClients : module.hasSessionClient;
      const value = (name) => domain ? { agents: {}, projects: { name }, builds: {} } : { name };
      const selected = (client) => domain ? client.projects : client;
      const runtime = (initial) => ({
        current: initial, writes: 0,
        read() { return this.current; },
        write(client) { this.writes++; this.current = client; },
      });
      assert.equal(has(), false);
      assert.throws(get, /No .* client/);
      const first = value('first');
      configure(first);
      const a = runtime(null);
      bind(a);
      assert.equal(a.current, first);
      assert.equal(get(), selected(first));
      const second = value('second');
      configure(second);
      const b = runtime(value('preconfigured'));
      bind(b);
      assert.equal(b.current, second);
      assert.equal(get(), selected(second));
      const writes = b.writes;
      bind(b);
      assert.equal(b.writes, writes);
      const third = value('third');
      configure(third);
      assert.equal(b.current, third);
      assert.equal(a.current, second);
      const failure = new Error('replacement failed');
      assert.throws(() => bind({ read: () => null, write: () => { throw failure; } }), (error) => error === failure);
      assert.equal(get(), selected(third));
      const fourth = value('fourth');
      b.write(fourth);
      assert.equal(get(), selected(fourth));
      assert.equal(has(), true);
    `;
		const result = Bun.spawnSync([process.execPath, "--eval", script], {
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(new TextDecoder().decode(result.stderr)).toBe("");
		expect(result.exitCode).toBe(0);
	});
}
