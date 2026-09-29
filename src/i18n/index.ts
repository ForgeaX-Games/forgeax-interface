import { useSyncExternalStore } from "react";
import { flushBrowserPrefs } from "../lib/browser-prefs-sync";
import {
	createLocaleRuntimeBinding,
	type Locale,
	type TFunction,
} from "./runtime";
import * as standalone from "./standalone";

export type { Locale, TFunction } from "./runtime";
export type { LocaleMeta } from "./standalone";
export { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./standalone";

const binding = createLocaleRuntimeBinding(
	{
		init: standalone.initI18n,
		getLocale: standalone.getLocale,
		setLocale: standalone.setLocale,
		subscribe: standalone.subscribe,
		t: standalone.t,
	},
	flushBrowserPrefs,
);

export const configureLocaleRuntime = binding.configure;
export const initI18n = binding.init;
export const getLocale = binding.getLocale;
export const setLocale = binding.setLocale;
export const subscribe = binding.subscribe;
export const t = binding.t;
export function changeLanguage(next: Locale): void {
	setLocale(next);
}
export function subscribeLocale(
	listener: (locale: Locale) => void,
): () => void {
	return subscribe(() => listener(getLocale()));
}

/** Stable translator reads the single current authority at call time. */
export function useTranslation(): {
	t: TFunction;
	i18n: { language: Locale; changeLanguage: (locale: Locale) => void };
} {
	const language = useSyncExternalStore(subscribe, getLocale, getLocale);
	return { t, i18n: { language, changeLanguage } };
}
