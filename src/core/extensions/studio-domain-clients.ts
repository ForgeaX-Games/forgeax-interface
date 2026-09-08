import type { AppExtension } from '../app-shell/types';
import type { AgentCatalogClient, StudioBuildClient, StudioProjectClient } from '../../store-parts/domain-clients';
import {
  getAgentCatalogClient,
  getStudioBuildClient,
  getStudioProjectClient,
  hasStudioDomainClients,
} from '../../store-parts/domain-clients';

export interface AgentCatalogCapability { readonly client: AgentCatalogClient }
export interface ProjectCapability { readonly client: StudioProjectClient }
export interface BuildCapability { readonly client: StudioBuildClient }

export const studioDomainClientsExtension: AppExtension = {
  id: 'studio-domain-clients',
  version: '1.0.0',
  provides: ['agentCatalog', 'projects', 'builds'],
  setup(ctx) {
    if (!hasStudioDomainClients()) {
      ctx.log.info('[studio-domain-clients] no clients configured; standalone hosts keep domain capabilities absent');
      return;
    }
    ctx.host.extend('agentCatalog', { client: getAgentCatalogClient() } satisfies AgentCatalogCapability);
    ctx.host.extend('projects', { client: getStudioProjectClient() } satisfies ProjectCapability);
    ctx.host.extend('builds', { client: getStudioBuildClient() } satisfies BuildCapability);
  },
};
