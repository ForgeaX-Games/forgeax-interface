import { describe, expect, it } from "bun:test";
import { createProjectContextBinding } from "./project-context-binding";

function owner(id: string) {
	return {
		getCurrentProject: () => id,
		setCurrentProject() {},
		subscribeCurrentProject: () => () => {},
	};
}
describe("project context binding", () => {
	it("selects one authority before readers and subscriptions capture it", () => {
		const fallback = owner("fallback");
		const binding = createProjectContextBinding(fallback);
		const product = owner("product");
		binding.configure(product);
		binding.configure(product);
		expect(binding.context.getCurrentProject()).toBe("product");
		expect(() => binding.configure(owner("other"))).toThrow();
		binding.configure(product);
	});
	it("does not replace an already used standalone authority", () => {
		const binding = createProjectContextBinding(owner("fallback"));
		const remove = binding.context.subscribeCurrentProject(() => {});
		expect(() => binding.configure(owner("product"))).toThrow();
		remove();
		expect(binding.context.getCurrentProject()).toBe("fallback");
	});
});
