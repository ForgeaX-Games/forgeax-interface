import {
	clearRetainedTopic,
	peekTopic,
	publishTopic,
	subscribeTopic,
} from "@forgeax/app-shell/application";

// Compatibility entry for existing external consumers. App Shell owns all state.
// biome-ignore lint/suspicious/noEmptyInterface: public declaration-merging extension point for external consumers.
export interface BusTopics {}
type TopicName = keyof BusTopics | (string & {});
type PayloadOf<K> = K extends keyof BusTopics ? BusTopics[K] : unknown;

export const publish = publishTopic as <K extends TopicName>(
	topic: K,
	payload: PayloadOf<K>,
	options?: { retain?: boolean },
) => void;
export const subscribe = subscribeTopic as <K extends TopicName>(
	topic: K,
	handler: (payload: PayloadOf<K>) => void,
) => () => void;
export const peek = peekTopic as <K extends TopicName>(
	topic: K,
) => PayloadOf<K> | undefined;
export const clearRetained = clearRetainedTopic;
