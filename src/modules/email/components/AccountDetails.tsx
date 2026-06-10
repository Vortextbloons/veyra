import { useState } from "react";
import {
  X,
  RefreshCw,
  AlertCircle,
  Loader2,
  Trash2,
} from "lucide-react";
import type { EmailAccount } from "../email-types";
import { useEmailStore } from "../email-store";

export function AccountDetails({
  account,
  onClose,
}: {
  account: EmailAccount;
  onClose: () => void;
}) {
  const syncAccount = useEmailStore((s) => s.syncAccount);
  const removeAccount = useEmailStore((s) => s.removeAccount);
  const isLoading = useEmailStore((s) => s.isLoading);
  const [confirming, setConfirming] = useState(false);

  const handleSync = () => {
    void syncAccount(account.id);
  };

  const handleRemove = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await removeAccount(account.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-details-title"
      >
        <div className="flex items-center justify-between">
          <h3
            id="account-details-title"
            className="text-[13px] font-semibold text-[var(--color-text)]"
          >
            Account details
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-[var(--color-text)]"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-[13px] font-semibold text-white">
            {account.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-[var(--color-text)]">
              {account.name}
            </div>
            <div className="truncate text-[11px] text-[var(--color-text-dim)]">
              {account.email}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-[var(--color-border)] bg-white/[0.02] p-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Provider
            </div>
            <div className="mt-0.5 text-[12px] font-medium capitalize text-[var(--color-text)]">
              {account.provider}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Status
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-text)]">
              {account.status === "connected" && (
                <span className="size-1.5 rounded-full bg-emerald-400" />
              )}
              {account.status === "syncing" && (
                <Loader2 className="size-3 animate-spin text-[var(--color-text-dim)]" />
              )}
              {account.status === "disconnected" && (
                <AlertCircle className="size-3 text-red-400" />
              )}
              <span className="capitalize">{account.status}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={isLoading || account.status === "syncing"}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] text-[12px] font-medium text-[var(--color-text-dim)] hover:bg-white/5 hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" />
            Sync
          </button>

          <button
            type="button"
            onClick={handleRemove}
            disabled={isLoading}
            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              confirming
                ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                : "border border-[var(--color-border)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-red-400"
            }`}
          >
            <Trash2 className="size-3.5" />
            {confirming ? "Confirm remove" : "Remove account"}
          </button>
          {confirming && (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex h-8 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-[12px] font-medium text-[var(--color-text-dim)] hover:bg-white/5 hover:text-[var(--color-text)]"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
