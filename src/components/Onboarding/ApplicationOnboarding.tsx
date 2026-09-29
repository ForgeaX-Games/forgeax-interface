import {
	installCustomEventObservation,
	installStorageObservation,
} from "@forgeax/app-shell/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { APP_EVENTS, STORAGE_KEYS } from "../../lib/storageKeys";
import { OnboardingController } from "./OnboardingController";
import { loadOnboarding, type OnboardingPhase, saveOnboarding } from "./types";

const OPEN_EVENT = "forgeax:onboarding-open";

/** Reopen setup without clearing projects, model settings or completed milestones. */
export function openApplicationOnboarding(): void {
	saveOnboarding({ ...loadOnboarding(), phase: "welcome" });
	window.dispatchEvent(new CustomEvent(OPEN_EVENT));
	window.dispatchEvent(new CustomEvent(APP_EVENTS.onboardingChanged));
}

function isSetupPhase(phase: OnboardingPhase): boolean {
	return phase === "welcome" || phase === "project";
}

/** First-run gate for product-owned shells. A reopened wizard keeps the editor mounted. */
export function ApplicationOnboarding({
	children,
	tourEnabled = true,
}: {
	children: ReactNode;
	tourEnabled?: boolean;
}) {
	const [flow, setFlow] = useState(() => {
		const phase = loadOnboarding().phase;
		return { phase, revision: 0, shellMounted: !isSetupPhase(phase) };
	});
	const onPhaseChange = useCallback((phase: OnboardingPhase) => {
		// Follow the controller in memory, including when WebView storage is unavailable.
		setFlow((current) =>
			current.phase === phase
				? current
				: {
						...current,
						phase,
						shellMounted: current.shellMounted || !isSetupPhase(phase),
					},
		);
	}, []);
	useEffect(() => {
		const restart = (phase: OnboardingPhase) => {
			setFlow((current) => ({
				phase,
				revision: current.revision + 1,
				shellMounted: current.shellMounted || !isSetupPhase(phase),
			}));
		};
		const open = () => restart("welcome");
		const sync = (event: StorageEvent) => {
			if (
				event.key === null ||
				event.key === STORAGE_KEYS.onboarding ||
				event.key === STORAGE_KEYS.onboardingSeenLegacy
			) {
				restart(loadOnboarding().phase);
			}
		};
		const disposeOpenObservation = installCustomEventObservation({
			target: window,
			eventType: OPEN_EVENT,
			onEvent: open,
		});
		const disposeStorageObservation = installStorageObservation({
			target: window,
			onStorage: sync,
		});
		return () => {
			disposeOpenObservation();
			disposeStorageObservation();
		};
	}, []);
	const setup = isSetupPhase(flow.phase);
	return (
		<>
			{flow.phase !== "done" && (
				<OnboardingController
					key={flow.revision}
					initialPhase={flow.phase}
					tourEnabled={tourEnabled}
					onPhaseChange={onPhaseChange}
				/>
			)}
			{flow.shellMounted && (
				<div hidden={setup} style={{ display: setup ? "none" : "contents" }}>
					{children}
				</div>
			)}
		</>
	);
}
