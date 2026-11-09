import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Lock, ShieldAlert } from "lucide-react";
import { DialogSurface } from "@/components/dialog-surface";
import { useProjectStore } from "../project-store";
import { PasswordField } from "./password-field";
import { estimateCrackTime, evaluatePasswordStrength } from "../password-strength";
import type { ProjectRecord } from "../project-types";

const STRENGTH_COLORS = [
  "bg-red-500/70",
  "bg-orange-500/70",
  "bg-amber-400/70",
  "bg-emerald-400/70",
  "bg-emerald-400",
];

/**
 * Turns an existing project into a password-locked vault.
 *
 * The form is deliberately slow: it requires the password twice, shows its
 * approximate strength, and refuses to continue until the user acknowledges
 * that a forgotten password means the data is gone. That is not legal boilerplate
 * — there is no recovery key, no developer override, and no escrow.
 */
export function EnableProjectLockModal({
  project,
  onClose,
}: {
  project: ProjectRecord;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const crackTime = useMemo(() => estimateCrackTime(password), [password]);
  const mismatch = confirmation.length > 0 && password !== confirmation;
  const tooShort = [...password].length < 10;

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const submit = useCallback(async () => {
    if (busy) return;
    if (tooShort) {
      setError("Use a password with at least 10 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    if (!acknowledged) {
      setError("Confirm that you understand a forgotten password cannot be recovered.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await useProjectStore.getState().enableLock(project.id, { password });
      setPassword("");
      setConfirmation("");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [acknowledged, busy, confirmation, onClose, password, project.id, tooShort]);

  return createPortal(
    <DialogSurface
      onClose={close}
      ariaLabel="Lock project with a password"
      panelClassName="w-[520px] max-w-[calc(100vw-32px)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-6 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-[var(--color-accent-soft,#1e1b4b)] p-2 text-[var(--color-accent)]">
          <Lock size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">Lock “{project.name}” with a password</h2>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            This project's chats, instructions, settings, memories, and drafts move into an
            encrypted vault. Veyra will ask for this password every time you open the project.
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
        <div>
          <PasswordField
            label="Project password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            disabled={busy}
            autoFocus
          />
          <div className="mt-2" aria-live="polite">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--color-text-dim)]">Strength</span>
              <span className={strength.score >= 3 ? "text-emerald-300" : strength.score >= 2 ? "text-amber-300" : "text-red-300"}>
                {strength.label}
              </span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"
              role="meter"
              aria-valuenow={strength.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Password strength"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-200 ${STRENGTH_COLORS[strength.score]}`}
                style={{ width: `${strength.percent}%` }}
              />
            </div>
            {password.length > 0 && (
              <p className="mt-1.5 text-[11px] text-[var(--color-text-dim)]">
                {crackTime
                  ? `An attacker with the encrypted files could guess this in roughly ${crackTime} at 1 million guesses per second.`
                  : "Enter a password."}
              </p>
            )}
            {strength.warnings.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[11px] text-amber-200/80">
                {strength.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </div>
        </div>

        <div>
          <PasswordField
            label="Confirm password"
            value={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
            disabled={busy}
          />
          {mismatch && <p className="mt-1.5 text-[11px] text-red-300">The passwords do not match.</p>}
        </div>

        <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
          <p className="flex items-center gap-2 text-[12px] font-medium text-amber-100">
            <ShieldAlert size={15} /> There is no password recovery
          </p>
          <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-amber-100/80">
            <li>
              Veyra does not store your password, keep a recovery key, or have a developer
              override. If you forget it, the encrypted project data cannot be opened — not by
              you, not by the app's authors.
            </li>
            <li>
              Files you linked from your own folders stay where they are and are <strong>not</strong>{" "}
              encrypted by this action. Locking protects what Veyra stores, not your filesystem.
            </li>
            <li>
              Anyone who can read the vault files and guesses the password can read the project.
              Choose something long and unique.
            </li>
          </ul>
          <label className="mt-3 flex items-start gap-2 text-[11px] text-amber-100">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={busy}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-400"
            />
            <span>
              I understand that a forgotten password permanently loses access to this project's
              data, and I have a copy of anything I cannot lose.
            </span>
          </label>
        </div>

        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
          <p className="text-[11px] text-[var(--color-text-dim)]">You can keep working in the project after locking.</p>
          <div className="flex gap-2">
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
              disabled={busy || tooShort || mismatch || !acknowledged}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? "Encrypting project…" : "Lock project"}
            </button>
          </div>
        </div>
      </form>
    </DialogSurface>,
    document.body,
  );
}
