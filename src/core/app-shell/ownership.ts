export const APP_SHELL_OWNERSHIP = {
  source: 'forgeax-interface',
  owner: 'forgeax-extension-platform',
  destination: '@forgeax/app-shell',
  status: 'migration-candidate',
  rule: 'generic composition only; domain features remain outside this package',
} as const;
