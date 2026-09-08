export function usesExternalIframeRuntime(
  manifest: {
    frontendUrl?: string;
    runtimeMode?: 'native-module' | 'dev' | 'embedded' | 'standalone';
    entry?: { frontend?: string; standalone?: unknown };
  },
): boolean {
  return Boolean(
    manifest.frontendUrl
    || manifest.entry?.standalone
    || manifest.entry?.frontend
    || manifest.runtimeMode === 'embedded',
  );
}
