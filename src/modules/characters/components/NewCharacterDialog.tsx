import { useState } from "react";
import { Drama, X } from "lucide-react";
import { useCharacterStore } from "../character-store";
import { CHARACTER_AVATAR_COLORS } from "../character-types";
import type { CharacterAvatarColor } from "../character-types";
import { AVATAR_GRADIENTS } from "../character-gradients";

interface NewCharacterDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewCharacterDialog({ open, onClose }: NewCharacterDialogProps) {
  // Only mount the form body while `open` is true. This unmounts on close,
  // so the next time the dialog opens, all local state (name, title, etc.)
  // is re-initialized fresh by useState — no effects needed.
  if (!open) return null;
  return <DialogBody onClose={onClose} />;
}

function DialogBody({ onClose }: { onClose: () => void }) {
  const createCharacter = useCharacterStore((s) => s.createCharacter);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [color, setColor] = useState<CharacterAvatarColor>("indigo");
  const [isGlobal, setIsGlobal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await createCharacter({
        name: trimmed,
        title: title.trim() || undefined,
        tagline: tagline.trim(),
        avatarColor: color,
        isGlobal,
        createdAt: now,
        updatedAt: now,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-[480px] max-w-[90vw] flex-col gap-4 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`grid size-7 place-items-center rounded-lg ${AVATAR_GRADIENTS[color]}`}
            >
              <Drama className="size-3.5 text-white" />
            </div>
            <h2 className="text-[14px] font-semibold text-white">New Character</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lyra Ashwood"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)] focus:outline-none"
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Title <span className="font-normal normal-case opacity-60">(optional)</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Elven Ranger"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)] focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Tagline
            </span>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="A one-line summary"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)] focus:outline-none"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Avatar Color
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CHARACTER_AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`size-7 rounded-md ${AVATAR_GRADIENTS[c]} ring-offset-2 ring-offset-[var(--color-panel)] transition-transform hover:scale-110 ${
                    c === color
                      ? "ring-2 ring-white"
                      : "ring-1 ring-inset ring-white/10"
                  }`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-dim)]">
            <input
              type="checkbox"
              checked={isGlobal}
              onChange={(e) => setIsGlobal(e.target.checked)}
              className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
            />
            <span>Global (available in every project)</span>
          </label>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || !name.trim()}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create Character"}
          </button>
        </footer>
      </div>
    </div>
  );
}

