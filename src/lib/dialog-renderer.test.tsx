import "./telemetry-test-prelude";
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	alertDialog,
	applicationDialogs,
	confirmDialog,
	unsavedChangesDialog,
} from "@forgeax/app-shell/application";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { createElement } from "react";
import { changeLanguage, getLocale } from "../i18n";
import * as legacy from "./dialog";

let savedLocale = getLocale();
beforeEach(() => {
	savedLocale = getLocale();
});

afterEach(() => {
	cleanup();
	applicationDialogs.cancelAll();
	changeLanguage(savedLocale);
});

function lastButton(): HTMLElement {
	const button = screen.getAllByRole("button").at(-1);
	if (!button) throw new Error("Expected a dialog action button");
	return button;
}

test("legacy callers and IDE public callers share the exact App Shell dialog functions", () => {
	expect(legacy.confirmDialog).toBe(confirmDialog);
	expect(legacy.alertDialog).toBe(alertDialog);
	expect(legacy.unsavedChangesDialog).toBe(unsavedChangesDialog);
});

test("public callers reach the existing Radix host with FIFO delivery, title fallback and custom labels", async () => {
	const confirmation = confirmDialog({
		body: createElement("strong", null, "Remove item?"),
		confirmText: "Proceed",
		cancelText: "Keep",
		danger: true,
	});
	const alert = alertDialog({
		title: "Notice",
		body: "Done",
		okText: "Understood",
	});
	render(<legacy.DialogHost />);
	expect(screen.getByRole("alertdialog")).toBeTruthy();
	expect(screen.getByText("Remove item?").tagName).toBe("STRONG");
	expect(screen.getByRole("heading").className).toContain("sr-only");
	expect(screen.getByRole("button", { name: "Proceed" }).className).toContain(
		"bg-destructive",
	);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Keep" }));
	});
	expect(await confirmation).toBe(false);
	expect(screen.getByRole("heading").textContent).toBe("Notice");
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Understood" }));
	});
	expect(await alert).toBeUndefined();
	expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("the product renderer preserves all three unsaved decisions and updates default labels with locale", async () => {
	changeLanguage("en");
	for (const [label, decision] of [
		["Save now", "save"],
		["Discard now", "discard"],
		["Stay", "cancel"],
	] as const) {
		const pending = unsavedChangesDialog({
			body: "Unsaved",
			saveText: "Save now",
			discardText: "Discard now",
			cancelText: "Stay",
		});
		render(<legacy.DialogHost />);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: label }));
		});
		expect(await pending).toBe(decision);
		cleanup();
	}
	const pending = confirmDialog({ body: "Question" });
	render(<legacy.DialogHost />);
	const englishLabel = lastButton().textContent;
	act(() => {
		changeLanguage("zh");
	});
	expect(lastButton().textContent).not.toBe(englishLabel);
	await act(async () => {
		fireEvent.click(lastButton());
	});
	expect(await pending).toBe(true);
});
