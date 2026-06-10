import { useState } from "react";
import {
  Send,
  Save,
  X,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useEmailStore } from "../email-store";

export function ComposePanel() {
  const draft = useEmailStore((s) => s.draft);
  const isLoading = useEmailStore((s) => s.isLoading);
  const error = useEmailStore((s) => s.error);
  const cancelCompose = useEmailStore((s) => s.cancelCompose);
  const sendDraft = useEmailStore((s) => s.sendDraft);
  const saveDraft = useEmailStore((s) => s.saveDraft);

  const [sent, setSent] = useState(false);

  if (!draft) return null;

  const updateField = (field: keyof typeof draft, value: string) => {
    useEmailStore.setState((state) => ({
      draft: state.draft ? { ...state.draft, [field]: value, updatedAt: Date.now() } : null,
    }));
  };

  const handleSend = async () => {
    await sendDraft();
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cancelCompose}
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            title="Cancel"
          >
            <X className="size-4" />
          </button>
          <h2 className="text-[13px] font-semibold text-[var(--color-text)]">
            {draft.subject ? draft.subject : "New message"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="flex items-center gap-1 text-[11px] text-red-400">
              <AlertCircle className="size-3" />
              {error}
            </span>
          )}
          {sent && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
              <Check className="size-3" />
              Sent
            </span>
          )}
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={isLoading}
            className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 text-[11px] text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:text-white disabled:opacity-50"
          >
            <Save className="size-3" />
            Save
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isLoading || !draft.to.trim()}
            className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 text-[11px] font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
            Send
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-0 border-b border-[var(--color-border)] px-4">
        <div className="flex h-9 items-center gap-3 border-b border-[var(--color-border)]">
          <span className="w-8 text-[11px] font-medium text-[var(--color-text-dim)]">To</span>
          <input
            type="text"
            value={draft.to}
            onChange={(e) => updateField("to", e.target.value)}
            className="min-w-0 flex-1 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]/60"
            placeholder="recipient@example.com"
          />
        </div>
        <div className="flex h-9 items-center gap-3 border-b border-[var(--color-border)]">
          <span className="w-8 text-[11px] font-medium text-[var(--color-text-dim)]">Cc</span>
          <input
            type="text"
            value={draft.cc}
            onChange={(e) => updateField("cc", e.target.value)}
            className="min-w-0 flex-1 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]/60"
            placeholder="cc@example.com"
          />
        </div>
        <div className="flex h-9 items-center gap-3 border-b border-[var(--color-border)]">
          <span className="w-8 text-[11px] font-medium text-[var(--color-text-dim)]">Bcc</span>
          <input
            type="text"
            value={draft.bcc}
            onChange={(e) => updateField("bcc", e.target.value)}
            className="min-w-0 flex-1 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]/60"
            placeholder="bcc@example.com"
          />
        </div>
        <div className="flex h-9 items-center gap-3">
          <span className="w-8 text-[11px] font-medium text-[var(--color-text-dim)]">Subject</span>
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => updateField("subject", e.target.value)}
            className="min-w-0 flex-1 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]/60"
            placeholder="Message subject"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        <textarea
          value={draft.body}
          onChange={(e) => updateField("body", e.target.value)}
          className="h-full w-full resize-none text-[12.5px] leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]/60"
          placeholder="Write your message here..."
        />
      </div>
    </div>
  );
}
