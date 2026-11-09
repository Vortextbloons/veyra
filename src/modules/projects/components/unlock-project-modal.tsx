import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Lock } from "lucide-react";
import { DialogSurface } from "@/components/dialog-surface";
import { useProjectStore } from "../project-store";
import { useVaultSessionStore } from "../vault-session-store";
import { PasswordField } from "./password-field";

/**
 * Password prompt shown before a locked project's content is loaded.
 *
 * The modal does not close itself on success: the caller decides what to open
 * next. A failure keeps the dialog open with the input cleared so a retry is
 * immediate.
 */
export function UnlockProjectModal({
  projectId,
  projectName,
  onClose,
  onUnlocked,
}: {
  projectId: string;
  projectName?: string;
  onClose: () => void;
  onUnlocked?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unlock = useVaultSessionStore((state) => state.unlock);
  const absorb = useProjectStore((state) => state.absorbUnlockedProject);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const submit = useCallback(async () => {
    if (busy || password.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await unlock(projectId, password);
      // Load the vault's project details before the caller renders the project.
      await absorb(projectId);
      if (!mounted.current) return;
      setPassword("");
      onUnlocked?.();
      onClose();
    } catch (cause) {
      if (!mounted.current) return;
      setPassword("");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [absorb, busy, onClose, onUnlocked, password, projectId, unlock]);

  return createPortal(
    <DialogSurface
      onClose={close}
      closeOnBackdrop={false}
      ariaLabel="Unlock project"
      panelClassName="w-[420px] max-w-[calc(100vw-32px)] rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-6 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-white/5 p-2 text-[var(--color-accent)]">
          <Lock size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">
            Unlock {projectName ? `“${projectName}”` : "project"}
          </h2>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            Enter this project's password to open its encrypted chats and instructions.
          </p>
        </div>
      </div>

      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <PasswordField
          label="Project password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          disabled={busy}
          autoFocus
        />
        {error && (
          <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-[11px] text-red-200">
            {error}
          </p>
        )}
        <p className="text-[11px] text-[var(--color-text-dim)]">
          No password recovery exists. If you do not remember it, this project's encrypted data
          cannot be opened.
        </p>
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-xs text-[var(--color-text-dim)] hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || password.length === 0}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      </form>
    </DialogSurface>,
    document.body,
  );
}
