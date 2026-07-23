"use client";

import { useI18n } from "@/components/i18n-provider";
import { useDialogFocusTrap } from "@/lib/dialog-focus";

type ConfirmDialogProps = {
  documentTitle: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  documentTitle,
  isDeleting,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const dialogRef = useDialogFocusTrap(true, onCancel);
  return (
    <div
      aria-labelledby="delete-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="w-full max-w-md bg-[var(--surface)] p-6 shadow-xl">
        <h2 className="text-xl font-semibold" id="delete-dialog-title">
          {t("library", "deleteTitle")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {t("library", "deleteDescription", { title: documentTitle })}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            {t("common", "actions.cancel")}
          </button>
          <button
            className="bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={isDeleting}
            onClick={onConfirm}
            type="button"
          >
            {isDeleting
              ? t("library", "deleting")
              : t("library", "deleteDocument")}
          </button>
        </div>
      </div>
    </div>
  );
}
