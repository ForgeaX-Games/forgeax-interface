/** Compatibility assembly retains the product footer policy and styling. */
import { StatusStrip } from "@forgeax/app-shell/react";
import { icons as LucideIcons } from "lucide-react";
import { useHost } from "../../core/app-shell";
import { usePanelRenderers } from "../DockShell/panelRenderers";
import "./GlobalStatusBar.css";

const VISUAL_ORDER = { left: 4, center: 2, right: 3 };
const VISIBLE_PER_SLOT = { left: 4, center: 2, right: 6 };
const CAROUSEL_INTERVAL_MS = 4000;

export function StripHostView() {
	const host = useHost();
	const renderers = usePanelRenderers();
	return (
		<StatusStrip
			items={renderers.stripItems}
			capacity={VISIBLE_PER_SLOT}
			visualOrder={VISUAL_ORDER}
			intervalMs={CAROUSEL_INTERVAL_MS}
			executeCommand={(id, args) => host.commands.execute(id, args)}
			renderIcon={(name) => {
				const Icon = LucideIcons[name as keyof typeof LucideIcons];
				return Icon ? <Icon size={12} className="sb-chip-icon" /> : null;
			}}
			overflowDescription={(count) => ({
				title: `${count} more chip(s) cycling every ${CAROUSEL_INTERVAL_MS / 1000}s · low priority items rotate through the last visible slot`,
				label: `${count} hidden status items, rotating`,
			})}
			aria-label="forgeax status bar"
			data-fx-slot="StatusBar"
			data-tour-id="footer"
		>
			<div
				className="sb-slot sb-slot-dock"
				data-fx-dock-bottom-host
				aria-hidden="true"
			/>
		</StatusStrip>
	);
}
