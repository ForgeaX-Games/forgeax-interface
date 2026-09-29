// Compatibility export while application consumers migrate to App Shell.
// The process-wide probe must have one module owner so an Editor registration
// is visible to Interface page chrome in the same realm.
export {
	isPageDirty,
	type PageDirtyProbe,
	type PageDirtyProbeTarget,
	registerPageDirtyProbe,
	subscribePageDirty,
} from "@forgeax/app-shell/application";
