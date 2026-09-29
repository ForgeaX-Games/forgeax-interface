/**
 * Imperative async replacement for the browser's blocking `confirm()` /
 * `alert()`, rendered with the shadcn AlertDialog so it matches the design
 * system and is non-blocking.
 *
 *   if (!(await confirmDialog({ body: '确认删除?', danger: true }))) return;
 *   await alertDialog({ body: '保存失败' });
 *   const decision = await unsavedChangesDialog({ body: '…' });
 *
 * A single <DialogHost /> (mounted in App) renders the App Shell dialog queue.
 * This is plain UI plumbing — it carries no tool/surface semantics, so it does
 * not touch the dual-modality path.
 */
import { applicationDialogs } from "@forgeax/app-shell/application";
import { useApplicationDialogRequest } from "@forgeax/app-shell/react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "@/i18n";

// Known standalone and application consumers retain this public compatibility
// entry. Requests and their settlement have exactly one owner in App Shell.
export {
	type AlertOptions,
	alertDialog,
	type ConfirmOptions,
	confirmDialog,
	type UnsavedChangesDecision,
	type UnsavedChangesOptions,
	unsavedChangesDialog,
} from "@forgeax/app-shell/application";

const { resolveConfirmAlert, resolveUnsaved } = applicationDialogs;

export function __resetDialogQueueForTests(): void {
	applicationDialogs.cancelAll();
}

export function DialogHost(): React.ReactElement | null {
	const { t } = useTranslation();
	const head = useApplicationDialogRequest();
	if (!head) return null;

	const isConfirm = head.kind === "confirm";
	const isUnsaved = head.kind === "unsaved";

	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open) {
					if (isUnsaved) resolveUnsaved(head.id, "cancel");
					else resolveConfirmAlert(head.id, false);
				}
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					{/* Radix requires an AlertDialogTitle inside AlertDialogContent for
              screen-reader a11y (else it console.errors). Most confirm/alert
              calls pass only a body, so when there's no visible title render an
              sr-only fallback title — satisfies a11y with no visual change. */}
					{head.options.title ? (
						<AlertDialogTitle>{head.options.title}</AlertDialogTitle>
					) : (
						<AlertDialogTitle className="sr-only">
							{isUnsaved
								? t("dialog.unsavedTitle")
								: isConfirm
									? t("dialog.confirmActionTitle")
									: t("dialog.alertTitle")}
						</AlertDialogTitle>
					)}
					{head.options.body && (
						// Body is the primary message here (most confirm/alert calls pass
						// no title), so use full foreground instead of the muted default —
						// muted-foreground (60% opacity) reads as illegible grey-on-dark.
						<AlertDialogDescription
							asChild
							className="whitespace-pre-line text-foreground"
						>
							<div>{head.options.body}</div>
						</AlertDialogDescription>
					)}
				</AlertDialogHeader>
				<AlertDialogFooter>
					{isUnsaved ? (
						<>
							<AlertDialogCancel
								onClick={() => resolveUnsaved(head.id, "cancel")}
							>
								{head.options.cancelText ?? t("common.cancel")}
							</AlertDialogCancel>
							<AlertDialogAction
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
								onClick={() => resolveUnsaved(head.id, "discard")}
							>
								{head.options.discardText ?? t("dialog.discardChanges")}
							</AlertDialogAction>
							<AlertDialogAction
								autoFocus
								onClick={() => resolveUnsaved(head.id, "save")}
							>
								{head.options.saveText ?? t("common.save")}
							</AlertDialogAction>
						</>
					) : (
						<>
							{isConfirm && (
								<AlertDialogCancel
									onClick={() => resolveConfirmAlert(head.id, false)}
								>
									{head.options.cancelText ?? t("common.cancel")}
								</AlertDialogCancel>
							)}
							<AlertDialogAction
								autoFocus
								className={
									isConfirm && head.options.danger
										? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
										: undefined
								}
								onClick={() => resolveConfirmAlert(head.id, true)}
							>
								{isConfirm
									? (head.options.confirmText ?? t("common.confirm"))
									: (head.options.okText ?? t("common.ok"))}
							</AlertDialogAction>
						</>
					)}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
