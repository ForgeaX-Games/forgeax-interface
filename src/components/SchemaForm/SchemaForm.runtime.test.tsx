import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SchemaForm } from "./SchemaForm";

afterEach(cleanup);

const schema = {
	type: "array" as const,
	title: "Values",
	items: { type: "string" as const },
};

describe("SchemaForm array rows", () => {
	it("keeps distinct duplicate rows stable through editing, adding, and deleting", () => {
		const view = render(
			<SchemaForm
				schema={schema}
				initialValue={["first", "second"]}
				onSubmit={() => {}}
			/>,
		);
		const inputs = view.getAllByRole("textbox") as HTMLInputElement[];
		const firstInput = inputs.at(0);
		expect(firstInput).toBeTruthy();
		if (!firstInput) throw new Error("expected first row");
		firstInput.focus();

		fireEvent.change(firstInput, { target: { value: "second" } });
		expect(view.getAllByRole("textbox")[0]).toBe(firstInput);
		expect(document.activeElement).toBe(firstInput);

		fireEvent.click(view.getByRole("button", { name: /Add/ }));
		expect(view.getAllByRole("textbox")).toHaveLength(3);

		const removeFirst = view.getAllByRole("button", { name: "×" }).at(0);
		expect(removeFirst).toBeTruthy();
		if (!removeFirst) throw new Error("expected first remove control");
		fireEvent.click(removeFirst);
		const remaining = view.getAllByRole("textbox") as HTMLInputElement[];
		expect(remaining).toHaveLength(2);
		expect(remaining[0]).not.toBe(firstInput);
		expect(remaining[0]?.value).toBe("second");
	});
});
