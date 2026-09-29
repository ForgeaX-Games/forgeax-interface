import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./ui-trajectory.ts", import.meta.url));

for (const scenario of ["history", "recording"] as const) {
	test(`trajectory binding preserves ${scenario} authority`, () => {
		const script = `
      import assert from 'node:assert/strict';
      const m = await import(${JSON.stringify(source)});
      assert.equal(typeof m.configureTrajectoryRuntime, 'function');
      globalThis.window = new EventTarget();
      m.recordTrajectory({ id: 'before.clear', source: 'human' });
      const previousSeq = m.readTrajectory().entries[0].seq;
      assert.equal(m.clearTrajectory(), 1);
      const detail = { id: 'before.bind', source: 'ai' };
      m.recordTrajectory(detail);
      const previous = m.readTrajectory().entries[0];
      let adopted;
      let reads = 0;
      const stop = () => {};
      const factory = (seed) => {
        adopted = seed;
        let entries = [...seed.entries];
        return {
          record: (value) => entries.push(value),
          read: () => { reads++; return { total: entries.length, count: entries.length, entries: [...entries] }; },
          clear: () => { const n = entries.length; entries = []; return n; },
          start: () => stop,
        };
      };
      if (${JSON.stringify(scenario)} === 'recording') {
        const stopFallback = m.startTrajectoryRecording();
        assert.equal(m.startTrajectoryRecording(), stopFallback);
        assert.throws(() => m.configureTrajectoryRuntime(factory), /before recording/);
        assert.equal(adopted, undefined);
        window.dispatchEvent(new CustomEvent('forgeax:ui-action-dispatch', { detail }));
        assert.equal(m.readTrajectory().total, 2);
        stopFallback();
        m.configureTrajectoryRuntime(factory);
        assert.equal(adopted.entries.length, 2);
      } else {
        const failure = new Error('factory failed');
        assert.throws(() => m.configureTrajectoryRuntime(() => { throw failure; }), (e) => e === failure);
        assert.equal(m.readTrajectory().entries[0], previous);
        assert.throws(() => m.configureTrajectoryRuntime(() => ({})), /Invalid trajectory runtime/);
        assert.equal(m.readTrajectory().entries[0], previous);
        assert.throws(() => m.configureTrajectoryRuntime(() => { m.configureTrajectoryRuntime(factory); }), /reentrant/);
        assert.equal(m.readTrajectory().entries[0], previous);
        assert.throws(() => m.configureTrajectoryRuntime((seed) => { m.recordTrajectory(detail); return factory(seed); }), /changed during/);
        assert.equal(m.readTrajectory().total, 2);
        m.configureTrajectoryRuntime(factory);
        assert.equal(adopted.sequence, previousSeq + 2);
        assert.equal(adopted.entries[0], previous);
        assert.equal(Object.isFrozen(adopted.entries), true);
      }
      const sameSeed = adopted;
      m.configureTrajectoryRuntime(factory);
      assert.equal(adopted, sameSeed);
      assert.throws(() => m.configureTrajectoryRuntime(() => ({})), /already configured/);
      assert.equal(m.startTrajectoryRecording(), stop);
      const count = m.readTrajectory().total;
      m.recordTrajectory(detail);
      assert.equal(m.readTrajectory().total, count + 1);
      assert.equal(m.clearTrajectory(), count + 1);
      assert.equal(m.readTrajectory().total, 0);
      assert.ok(reads >= 3);
    `;
		const result = Bun.spawnSync([process.execPath, "--eval", script], {
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(new TextDecoder().decode(result.stderr)).toBe("");
		expect(result.exitCode).toBe(0);
	});
}
