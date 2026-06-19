import { useState, type ReactNode } from "react";
import { DialogSurface } from "@/components/dialog-surface";

type ConfirmDangerModalProps = {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  cancelLabel?: string;
  confirmLabel?: string;
  closeOnBackdrop?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  actionsClassName?: string;
  cancelButtonClassName?: string;
  confirmButtonClassName?: string;
};

export function ConfirmDangerModal({
  open,
  title,
  description,
  onCancel,
  onConfirm,
  cancelLabel = "Cancel",
  confirmLabel = "Delete",
  closeOnBackdrop = true,
  overlayClassName,
  panelClassName = "flex w-[360px] max-w-[90vw] flex-col gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-4 shadow-2xl",
  titleClassName = "text-[13px] font-semibold text-white",
  descriptionClassName = "text-[12px] text-[var(--color-text-dim)]",
  actionsClassName = "flex items-center justify-end gap-2",
  cancelButtonClassName = "rounded-md px-3 py-1.5 text-[12.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white",
  confirmButtonClassName = "rounded-md bg-red-500/80 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-red-500",
}: ConfirmDangerModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <DialogSurface
      open={open}
      onClose={onCancel}
      closeOnBackdrop={closeOnBackdrop}
      overlayClassName={overlayClassName}
      panelClassName={panelClassName}
    >
      <h3 className={titleClassName}>{title}</h3>
      <p className={descriptionClassName}>{description}</p>
      <div className={actionsClassName}>
        <button type="button" onClick={onCancel} disabled={isConfirming} className={cancelButtonClassName}>
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (isConfirming) return;
            setIsConfirming(true);
            try {
              await onConfirm();
            } finally {
              setIsConfirming(false);
            }
          }}
          disabled={isConfirming}
          className={confirmButtonClassName}
        >
          {isConfirming ? "Working..." : confirmLabel}
        </button>
      </div>
    </DialogSurface>
  );
}
