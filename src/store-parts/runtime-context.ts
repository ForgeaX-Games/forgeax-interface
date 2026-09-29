import { resolveKernelForAgent } from "../lib/agent-cli-provider";
import { recordLog } from "../lib/logSink";
import { getSurfaceWindowingController } from "../lib/platform";
import { setCurrentProject } from "../lib/project-context";
import {
	getStudioProjectClient,
	hasStudioDomainClients,
} from "./domain-clients";
import { getSessionClient } from "./session-client";

/** Existing transport/presentation adapters, not another state authority.
 * Clients are resolved at call time because composition installs them after imports. */
export function createApplicationShellStoreContext() {
	return {
		getSessionClient,
		getStudioProjectClient,
		hasStudioDomainClients,
		getSurfaceWindowingController,
		setCurrentProject,
		resolveKernelForAgent,
		recordLog,
		async reconcileSessionModelToActiveProvider(
			sid: string,
			agentPath: string,
		) {
			const module = await import("../lib/model-route");
			return module.reconcileSessionModelToActiveProvider(sid, agentPath);
		},
		async dropFileActivitySession(sid: string): Promise<void> {
			const module = await import("../lib/file-activity-stream");
			module.dropFileActivitySession(sid);
		},
	};
}

export type ApplicationShellStoreContext = ReturnType<
	typeof createApplicationShellStoreContext
>;
