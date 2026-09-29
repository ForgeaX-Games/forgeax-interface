import { describe, expect, test } from "bun:test";

// The real locale singleton, DOM and application bootstrap share one isolated
// process per case; no mock-module replacement can hide their ordering.
function probe(stored: string | null, requested?: string, denied = false) {
	const result = Bun.spawnSync(
		[
			process.execPath,
			"--eval",
			`
    import './test/happydom.ts';
    import { startInterfaceApplication } from './src/application';
    import { getLocale } from './src/i18n';
    globalThis.fetch = async () => new Response('{}', { headers: { 'content-type': 'application/json' } });
    if (${JSON.stringify(stored)} !== null) localStorage.setItem('forgeax.locale', ${JSON.stringify(stored)});
    if (${denied}) Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
    const observed = [];
    const overrides = { extensions: [{ id: 'locale-probe', version: '1', setup() {
      observed.push({ locale: getLocale(), lang: document.documentElement.lang });
    } }] };
    const runtime = await startInterfaceApplication(overrides, { locale: ${JSON.stringify(requested) ?? "undefined"} });
    const initial = { locale: getLocale(), lang: document.documentElement.lang };
    await runtime.dispose();
    console.log(JSON.stringify({ initial, observed }));
    process.exit(0);
  `,
		],
		{
			cwd: new URL("../..", import.meta.url).pathname,
			stdout: "pipe",
			stderr: "pipe",
			timeout: 15_000,
		},
	);
	expect(result.exitCode).toBe(0);
	const lines = new TextDecoder().decode(result.stdout).trim().split("\n");
	return JSON.parse(lines.at(-1)!);
}

describe("application locale startup ownership", () => {
	test("real React subscribers follow handoff and remount with a stable translator", () => {
		const result = Bun.spawnSync(
			[
				process.execPath,
				"--eval",
				`
      import './test/happydom.ts';
      import assert from 'node:assert/strict';
      import { createElement, act } from 'react';
      import { createRoot } from 'react-dom/client';
      import * as locale from './src/i18n';
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      let current = 'en'; const listeners = new Set();
      const runtime = {
        init() { this.setLocale('zh'); }, getLocale: () => current,
        setLocale(next) { current = next; for (const fn of listeners) fn(); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        t: (key) => current + ':' + key,
      };
      const factory = () => runtime;
      const container = document.createElement('div'); document.body.append(container);
      let root = createRoot(container), translator;
      function View() {
        const { t, i18n } = locale.useTranslation();
        if (translator) assert.equal(t, translator); translator = t;
        return createElement('div', null, i18n.language + ' ' + t('probe'));
      }
      await act(async () => root.render(createElement(View)));
      assert.equal(container.textContent, 'en probe');
      await act(async () => { locale.configureLocaleRuntime(factory); locale.initI18n(); });
      assert.equal(container.textContent, 'zh zh:probe');
      await act(async () => runtime.setLocale('en'));
      assert.equal(container.textContent, 'en en:probe');
      await act(async () => root.unmount()); runtime.setLocale('zh'); root = createRoot(container);
      await act(async () => root.render(createElement(View)));
      assert.equal(container.textContent, 'zh zh:probe');
      await act(async () => locale.configureLocaleRuntime(factory));
      await act(async () => root.unmount());
      console.log('real-react-locale-handoff-pass');
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
		expect(new TextDecoder().decode(result.stderr)).toBe("");
		expect(result.exitCode).toBe(0);
		expect(new TextDecoder().decode(result.stdout)).toContain(
			"real-react-locale-handoff-pass",
		);
	});
	test("startup installs one product authority before setup and never starts the standalone locale", () => {
		const result = Bun.spawnSync(
			[
				process.execPath,
				"--eval",
				`
      import './test/happydom.ts';
      import { startInterfaceApplication } from './src/application';
      import { getLocale, setLocale, t, subscribe } from './src/i18n';
      import * as standalone from './src/i18n/standalone';
      globalThis.fetch = async () => new Response('{}', { headers: { 'content-type': 'application/json' } });
      let current = 'en', factories = 0, inits = 0, flush;
      const listeners = new Set(), observed = [], changes = [];
      const stop = subscribe(() => changes.push(getLocale()));
      const product = {
        init() { inits++; this.setLocale('zh'); }, getLocale: () => current,
        setLocale(next) { current = next; document.documentElement.lang = next; for (const fn of listeners) fn(); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        t: (key) => current + ':' + key,
      };
      const createLocaleRuntime = (context) => { factories++; flush = context.flushBrowserPrefs; return product; };
      const overrides = { extensions: [{ id: 'product-locale-probe', version: '1', setup() {
        observed.push([getLocale(), document.documentElement.lang, t('probe')]);
      } }] };
      const first = await startInterfaceApplication(overrides, { createLocaleRuntime });
      setLocale('en');
      const wroteProduct = product.getLocale() === 'en';
      await first.dispose();
      const second = await startInterfaceApplication(overrides, { createLocaleRuntime });
      await second.dispose(); stop();
      const before = changes.length; product.setLocale('en');
      localStorage.setItem('forgeax.locale', 'zh');
      window.dispatchEvent(new StorageEvent('storage', { key: 'forgeax.locale' }));
      console.log(JSON.stringify({ factories, inits, observed, wroteProduct, stopped: before === changes.length,
        standalone: standalone.getLocale(), current, flush: typeof flush }));
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
		expect(new TextDecoder().decode(result.stderr)).not.toContain("error:");
		expect(result.exitCode).toBe(0);
		const lines = new TextDecoder().decode(result.stdout).trim().split("\n");
		expect(JSON.parse(lines.at(-1)!)).toEqual({
			factories: 1,
			inits: 2,
			observed: [
				["zh", "zh", "zh:probe"],
				["zh", "zh", "zh:probe"],
			],
			wroteProduct: true,
			stopped: true,
			standalone: "en",
			current: "en",
			flush: "function",
		});
	});
	for (const [stored, requested, denied, expected] of [
		["zh", undefined, false, "zh"],
		["invalid", undefined, false, "en"],
		["zh", "en", false, "en"],
		[null, "zh", true, "zh"],
	] as const) {
		test(`initializes ${expected} before extension setup (${stored}/${requested}/${denied})`, () => {
			const state = { locale: expected, lang: expected };
			expect(probe(stored, requested, denied)).toEqual({
				initial: state,
				observed: [state],
			});
		});
	}
});
