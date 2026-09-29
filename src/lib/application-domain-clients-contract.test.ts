import { describe, expect, test } from "bun:test";

// Each probe owns a fresh module graph: configuring the application singleton
// must not leak clients or active-project subscriptions into other test files.
function probe(activeSlug: string | null) {
	const source = `
    import './test/happydom.ts';
    import { configureStudioDomainClients } from './src/application';
    import {
      configureStudioDomainClients as configureOwner,
      getAgentCatalogClient, getStudioProjectClient, getStudioBuildClient,
    } from './src/store-parts/domain-clients';
    import { useShellStore } from './src/store';
    const selection = { activeSlug: ${JSON.stringify(activeSlug)} };
    let reads = 0;
    let subscriptions = 0;
    const clients = {
      agents: {}, builds: {},
      projects: {
        getActiveProject: async () => { reads++; return selection; },
        subscribeActiveProject: () => { subscriptions++; return () => {}; },
      },
    };
    localStorage.setItem('forgeax.pinnedSlug', 'obsolete-game');
    configureStudioDomainClients(clients);
    const readsBeforeInit = reads;
    await useShellStore.getState().initActiveGame();
    const state = useShellStore.getState();
    console.log(JSON.stringify({
      sameFunction: configureStudioDomainClients === configureOwner,
      sameClients: getAgentCatalogClient() === clients.agents
        && getStudioProjectClient() === clients.projects
        && getStudioBuildClient() === clients.builds,
      readsBeforeInit, reads, subscriptions,
      activeSlug: state.activeGameSlug, resolved: state.activeGameResolved,
      hasLegacySetter: 'setPinnedSlug' in state,
      legacyPin: localStorage.getItem('forgeax.pinnedSlug'),
    }));
  `;
	const result = Bun.spawnSync([process.execPath, "--eval", source], {
		cwd: new URL("../..", import.meta.url).pathname,
		stdout: "pipe",
		stderr: "pipe",
		timeout: 10_000,
	});
	expect(new TextDecoder().decode(result.stderr)).toBe("");
	expect(result.exitCode).toBe(0);
	return JSON.parse(new TextDecoder().decode(result.stdout).trim());
}

describe("application domain-client injection", () => {
	for (const activeSlug of ["current-game", null]) {
		test(`uses the injected project authority for ${activeSlug ?? "an empty host"}`, () => {
			expect(probe(activeSlug)).toEqual({
				sameFunction: true,
				sameClients: true,
				readsBeforeInit: 0,
				reads: 1,
				subscriptions: 1,
				activeSlug,
				resolved: true,
				hasLegacySetter: false,
				legacyPin: null,
			});
		});
	}
});
