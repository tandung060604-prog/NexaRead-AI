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
  return (
    <div
      aria-labelledby="delete-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      role="dialog"
    >
      <div className="w-full max-w-md bg-[var(--surface)] p-6 shadow-xl">
        <h2 className="text-xl font-semibold" id="delete-dialog-title">
          Delete document?
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          “{documentTitle}” and its stored PDF will be permanently deleted.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={isDeleting}
            onClick={onConfirm}
            type="button"
          >
            {isDeleting ? "Deleting..." : "Delete document"}
          </button>
        </div>
      </div>
    </div>
  );
}

