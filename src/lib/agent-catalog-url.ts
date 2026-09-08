import { getLocale, type Locale } from '@/i18n';

/** Current UI locale for Agent Catalog query params. */
export function agentCatalogLang(): Locale {
  return getLocale();
}

/** Build a locale-aligned Agent Catalog query string. */
export function agentCatalogQuery(extra?: Record<string, string | undefined>): string {
  const params = new URLSearchParams({ lang: getLocale() });
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== '') params.set(k, v);
    }
  }
  return params.toString();
}

/** Build `/api/agents` with `lang` aligned to Studio locale. */
export function agentCatalogUrl(extra?: Record<string, string | undefined>): string {
  return `/api/agents?${agentCatalogQuery(extra)}`;
}

/** Build the locale-aware recent Agent activity URL. */
export function agentEventsRecentUrl(limit = 30): string {
  return `/api/agents/events/recent?limit=${limit}&lang=${getLocale()}`;
}
