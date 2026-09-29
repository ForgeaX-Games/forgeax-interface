// ConnectModelPrompt — the first-chat interceptor (design §11). Mounted once at
// the app root; dormant until the chat composer fires APP_EVENTS.openConnectPrompt
// because the product-injected readiness service reported no usable model path.
//
// It offers the two connectable sources, framed as "connect to send the message
// you just typed":
//   API Key  → deep-link into Settings › Providers (user pastes a key there).
//   Local CLI→ deep-link into Settings › Providers.
//
// Kept intentionally thin: it owns presentation only. The Chat composer that
// opened it owns the pending text, readiness interception, and resume.

import { installCustomEventObservation } from "@forgeax/app-shell/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import { APP_EVENTS } from "../../lib/storageKeys";
import { useShellStore } from "../../store";
import "./Onboarding.css";

export function ConnectModelPrompt() {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const openOverlay = useShellStore((s) => s.openOverlay);

	useEffect(() => {
		const onOpen = () => setOpen(true);
		const disposeOpenPromptObservation = installCustomEventObservation({
			target: window,
			eventType: APP_EVENTS.openConnectPrompt,
			onEvent: onOpen,
		});
		return disposeOpenPromptObservation;
	}, []);

	const gotoProviders = useCallback(() => {
		setOpen(false);
		openOverlay("settings", "providers");
	}, [openOverlay]);

	if (!open) return null;

	return (
		<div
			className="fx-ob-modal-scrim"
			style={{ zIndex: 99998 }}
			role="dialog"
			aria-modal="true"
			aria-labelledby="fx-connect-model-prompt-title"
			onClick={(event) => {
				if (event.target === event.currentTarget) setOpen(false);
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") setOpen(false);
			}}
			tabIndex={-1}
		>
			<div className="fx-ob-modal">
				<div className="fx-ob-modal-inner">
					<div className="fx-ob-stack fx-ob-gap6">
						<h2 id="fx-connect-model-prompt-title" className="fx-ob-h2">
							{t("onboarding.nudge.connectTitle")}
						</h2>
						<div className="fx-ob-sec">{t("onboarding.nudge.connectSub")}</div>
					</div>
					<div className="fx-ob-stack fx-ob-gap8">
						<button
							type="button"
							className="fx-ob-btn fx-ob-btn-primary fx-ob-btn-block"
							onClick={gotoProviders}
						>
							{t("onboarding.nudge.connectKey")}
						</button>
						<button
							type="button"
							className="fx-ob-btn fx-ob-btn-secondary fx-ob-btn-block"
							onClick={gotoProviders}
						>
							{t("onboarding.nudge.connectCli")}
						</button>
					</div>
					<div className="fx-ob-row" style={{ justifyContent: "center" }}>
						<button
							type="button"
							className="fx-ob-btn fx-ob-btn-ghost"
							onClick={() => setOpen(false)}
						>
							{t("onboarding.nudge.connectCancel")}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
