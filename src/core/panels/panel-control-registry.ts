import {
	createPanelControlRegistry as createRegistry,
	type PanelControlRegistry as Registry,
} from "@forgeax/app-shell/application";
import type { PanelControlContribution } from "./types";

export type PanelControlRegistry = Registry<PanelControlContribution>;
export const createPanelControlRegistry =
	createRegistry<PanelControlContribution>;
