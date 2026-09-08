import type { AgentCatalogCapability, BuildCapability, ProjectCapability } from './studio-domain-clients';

declare module '../app-shell/types' {
  interface AppHost {
    readonly agentCatalog?: AgentCatalogCapability;
    readonly projects?: ProjectCapability;
    readonly builds?: BuildCapability;
  }
}
export {};
