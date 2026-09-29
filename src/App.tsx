// Compatibility entry for existing standalone consumers. Product assemblies
// should own ApplicationRuntimeRoot and render ApplicationShell directly.

import { ApplicationRuntimeRoot } from "@forgeax/app-shell/application";
import { useCallback } from "react";
import {
	type ApplicationOnboardingOptions,
	ApplicationShell,
} from "./ApplicationShell";
import {
	type AppHostBootstrapOverrides,
	startInterfaceApplication,
} from "./application";

export interface AppProps {
	/** Studio injects concrete overlay / surface / slot / detached / editor
	 *  extensions here (ADR 0025 M1 — the sole assembly channel; the legacy
	 *  `panelRenderers` escape hatch was removed once studio migrated). */
	overrides?: AppHostBootstrapOverrides;
	/** Product-level onboarding policy; setup remains shared across assemblies. */
	onboarding?: ApplicationOnboardingOptions;
}

export function App({
	overrides,
	onboarding,
}: AppProps = {}): React.ReactElement | null {
	const start = useCallback(
		() => startInterfaceApplication(overrides),
		[overrides],
	);
	return (
		<ApplicationRuntimeRoot start={start}>
			{(runtime) => (
				<ApplicationShell runtime={runtime} onboarding={onboarding} />
			)}
		</ApplicationRuntimeRoot>
	);
}
