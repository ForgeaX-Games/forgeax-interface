import { HostProvider } from "@forgeax/app-shell/application";
import type { SurfaceDescriptor } from "@forgeax/app-shell/window";
import {
	type ComponentType,
	Fragment,
	type ReactElement,
	type ReactNode,
} from "react";
import type { InterfaceApplicationRuntime } from "./application";
import { BrandProvider } from "./brand";
import { DetachedSurface } from "./components/DetachedSurface";
import { PanelRenderersProvider } from "./components/DockShell/panelRenderers";

export interface ApplicationDetachedShellProps {
	readonly host: InterfaceApplicationRuntime["host"];
	readonly surface: SurfaceDescriptor;
	/** A stable product-owned provider rendered inside the shell contexts. */
	readonly SurfaceProvider?: ComponentType<{ children: ReactNode }>;
}

/** Detached presentation only; the caller retains startup, recovery and disposal. */
export function ApplicationDetachedShell({
	host,
	surface,
	SurfaceProvider = Fragment,
}: ApplicationDetachedShellProps): ReactElement {
	return (
		<BrandProvider>
			<HostProvider value={host}>
				<PanelRenderersProvider value={host.panels}>
					<SurfaceProvider>
						<DetachedSurface surface={surface} />
					</SurfaceProvider>
				</PanelRenderersProvider>
			</HostProvider>
		</BrandProvider>
	);
}
