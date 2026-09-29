import { createProjectContextBinding } from "./project-context-binding";
import * as fallback from "./project-context-compat";

const binding = createProjectContextBinding(fallback);
export const configureApplicationProjectContext = binding.configure;
export const { getCurrentProject, setCurrentProject, subscribeCurrentProject } =
	binding.context;
export function __resetCurrentProjectIdForTests() {
	fallback.__resetCurrentProjectIdForTests();
}
