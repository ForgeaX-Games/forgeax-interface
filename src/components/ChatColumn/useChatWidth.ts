import {
	createPersistentSizeStore,
	usePersistentSizeStore,
} from "@forgeax/app-shell/react";

export const CHAT_MIN_WIDTH = 280;
export const CHAT_MAX_WIDTH = 720;
export const CHAT_DEFAULT_WIDTH = 360;

export const chatWidthStore = createPersistentSizeStore({
	storageKey: "forgeax:chat-width",
	defaultSize: CHAT_DEFAULT_WIDTH,
	minSize: CHAT_MIN_WIDTH,
	maxSize: CHAT_MAX_WIDTH,
});

export function useChatWidth(): number {
	return usePersistentSizeStore(chatWidthStore);
}
