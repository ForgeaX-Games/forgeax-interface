import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("dialog service belongs to App Shell while Interface retains the accessible product renderer", () => {
	const source = readFileSync(new URL("./dialog.tsx", import.meta.url), "utf8");
	expect(source).toContain("@forgeax/app-shell/application");
	expect(source).toContain("useApplicationDialogRequest");
	expect(source).not.toMatch(/let\s+(queue|seq)\b/);
	expect(source).not.toMatch(/new\s+(Promise|Set|Map)\b/);
	expect(source).not.toContain("useState");
	expect(source).not.toContain("listeners.add");
	expect(source).toContain('"@/components/ui/alert-dialog"');
	expect(source).toContain('"@/i18n"');
	expect(source).toContain('t("dialog.unsavedTitle")');
	expect(source).toContain('className="sr-only"');
	expect(source).toContain("autoFocus");
	expect(source).toContain('resolveUnsaved(head.id, "cancel")');
	expect(source).toContain('resolveUnsaved(head.id, "discard")');
	expect(source).toContain('resolveUnsaved(head.id, "save")');
});
