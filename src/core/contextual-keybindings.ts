export type {
	ApplicationContextualKeybindingsApi as ContextualKeybindingsApi,
	KeybindingContext,
} from "@forgeax/app-shell/application";
export {
	APPLICATION_KEYBINDING_SCOPE,
	createContextualKeybindings,
	detectKeybindingPlatform,
	isEditableEventTarget,
	type KeybindingContribution,
	type KeybindingHandleResult,
	type KeybindingPlatform,
	type KeybindingPreventDefault,
	type KeybindingResolution,
	matchesKeybinding,
	type NormalizedKeyEvent,
	normalizeKeybinding,
	normalizeKeyboardEvent,
	type RegisteredKeybinding,
	type ResolveKeybindingInput,
	resolveKeybinding,
} from "@forgeax/app-shell/application";
