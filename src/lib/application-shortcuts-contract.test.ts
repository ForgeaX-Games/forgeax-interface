import { expect, test } from "bun:test";

test("real startup carries exact product definitions and rolls back factory failures", () => {
	const result = Bun.spawnSync(
		[
			process.execPath,
			"--eval",
			`
    import './test/happydom.ts';
    import { startInterfaceApplication } from './src/application';
    import { getCommandPaletteOpen } from './src/lib/command-palette-store';
    globalThis.fetch = async () => new Response('{}', { headers: { 'content-type': 'application/json' } });
    const catalog = Object.freeze([]);
    let calls = 0, host, action;
    const runtime = await startInterfaceApplication({}, { createShellShortcuts(context) {
      calls++; host = context.host; action = context.toggleCommandPalette;
      if (typeof context.toggleCommandPalette !== 'function') throw new Error('missing renderer action');
      return catalog;
    } });
    const before = getCommandPaletteOpen(); action();
    const exact = runtime.shellShortcuts === catalog && runtime.host === host && getCommandPaletteOpen() !== before;
    action();
    await runtime.dispose();
    const fallback = await startInterfaceApplication();
    const omitted = fallback.shellShortcuts === undefined;
    await fallback.dispose();
    let disposed = 0, failed = false;
    const error = new Error('product definition failure');
    try {
      await startInterfaceApplication({ extensions: [{ id: 'shortcut-cleanup-probe', version: '1', setup() { return () => { disposed++; }; } }] }, {
        createShellShortcuts() { throw error; }
      });
    } catch (actual) { failed = actual === error; }
    console.log(JSON.stringify({ exact, omitted, calls, disposed, failed }));
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
	expect(result.exitCode).toBe(0);
	const lines = new TextDecoder().decode(result.stdout).trim().split("\n");
	expect(JSON.parse(lines.at(-1)!)).toEqual({
		exact: true,
		omitted: true,
		calls: 1,
		disposed: 1,
		failed: true,
	});
});
