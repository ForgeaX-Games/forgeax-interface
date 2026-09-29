import {
	createPersistentSizeStore,
	usePersistentSizeStore,
} from "@forgeax/app-shell/react";

export const AUXBAR_MIN_WIDTH = 200;
export const AUXBAR_MAX_WIDTH = 640;
export const AUXBAR_DEFAULT_WIDTH = 280;

export const auxBarWidthStore = createPersistentSizeStore({
	storageKey: "forgeax:auxbar-width",
	defaultSize: AUXBAR_DEFAULT_WIDTH,
	minSize: AUXBAR_MIN_WIDTH,
	maxSize: AUXBAR_MAX_WIDTH,
});

export function useAuxBarWidth(): number {
	return usePersistentSizeStore(auxBarWidthStore);
}
