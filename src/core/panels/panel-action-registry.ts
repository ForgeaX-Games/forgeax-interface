import {
	createPanelActionRegistry as createRegistry,
	type PanelActionRegistry as Registry,
} from "@forgeax/app-shell/application";
import type { PanelActionContribution } from "./types";

export type PanelActionRegistry = Registry<PanelActionContribution>;
export const createPanelActionRegistry =
	createRegistry<PanelActionContribution>;
