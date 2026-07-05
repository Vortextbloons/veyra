import { useState, useEffect } from "react";
import {
  Pen,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { useEmailStore } from "../email-store";
import type { EmailAiDraft } from "../email-types";

const TONE_OPTIONS = [
  { value: "concise", label: "Concise" },
  { value: "formal", label: "Formal" },
  { value: "friendly", label: "Friendly" },
  { value: "detailed", label: "Detailed" },
];

export function EmailAiDraftPanel({
  threadId,
  accountId,
}: {
  threadId: string;
  accountId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tone, setTone] = useState("concise");

  const aiDrafts = useEmailStore((s) => s.aiDrafts);
  const aiDraftLoading = useEmailStore((s) => s.aiDraftLoading);
  const loadAiDrafts = useEmailStore((s) => s.loadAiDrafts);
  const generateAiDraft = useEmailStore((s) => s.generateAiDraft);
  const deleteAiDraft = useEmailStore((s) => s.deleteAiDraft);
  const insertAiDraftIntoCompose = useEmailStore(
    (s) => s.insertAiDraftIntoCompose,
  );

  useEffect(() => {
    if (expanded) {
      void loadAiDrafts(threadId);
    }
  }, [expanded, threadId, loadAiDrafts]);

  const handleGenerate = () => {
    void generateAiDraft({ accountId, threadId, tone });
  };

  const handleInsert = (draft: EmailAiDraft) => {
    insertAiDraftIntoCompose(draft);
  };

  const handleDelete = (draftId: string) => {
    void deleteAiDraft(draftId);
  };

  const statusLabel = (status: EmailAiDraft["status"]) => {
    switch (status) {
      case "suggested":
        return "Suggested";
      case "inserted":
        return "Used";
      case "edited":
        return "Edited";
      case "dismissed":
        return "Dismissed";
      default:
        return status;
    }
  };

  // Filter out dismissed drafts for display
  const visibleDrafts = aiDrafts.filter((d) => d.status !== "dismissed");

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-panel)]/50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[11px] text-[var(--color-text-dim)] hover:bg-white/[0.02]"
      >
        <Pen className="size-3 text-[var(--color-accent)]" />
        <span className="font-medium">AI Drafts</span>
        {visibleDrafts.length > 0 && (
          <span className="text-[10px] opacity-60">
            {visibleDrafts.length} draft{visibleDrafts.length === 1 ? "" : "s"}
          </span>
        )}
        <div className="flex-1" />
        {expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
      </button>
      {expanded && (
        <div className="space-y-2 px-4 pb-3">
          {/* Generate controls */}
          <div className="flex items-center gap-2">
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[11px] text-[var(--color-text)] outline-none"
            >
              {TONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={aiDraftLoading}
              className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 text-[11px] font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {aiDraftLoading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {visibleDrafts.length > 0 ? "Regenerate" : "Generate Draft"}
            </button>
          </div>

          {/* Loading state */}
          {aiDraftLoading && visibleDrafts.length === 0 && (
            <div className="flex items-center gap-2 py-2 text-[11px] text-[var(--color-text-dim)]">
              <Loader2 className="size-3 animate-spin" />
              Generating draft...
            </div>
          )}

          {/* Draft list */}
          {visibleDrafts.length > 0 && (
            <div className="space-y-1.5">
              {visibleDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-[var(--color-text)]">
                        {draft.subject}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--color-text-dim)] line-clamp-2">
                        {draft.body}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        draft.status === "suggested"
                          ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                          : "bg-white/[0.06] text-[var(--color-text-dim)]"
                      }`}
                    >
                      {statusLabel(draft.status)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-[9px] text-[var(--color-text-dim)]/60">
                      {draft.tone}
                    </span>
                    <span className="text-[9px] text-[var(--color-text-dim)]/40">
                      &middot;
                    </span>
                    <span className="text-[9px] text-[var(--color-text-dim)]/60">
                      {new Date(draft.createdAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className="flex-1" />
                    {draft.status === "suggested" && (
                      <button
                        type="button"
                        onClick={() => handleInsert(draft)}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-accent)] hover:bg-white/[0.06]"
                        title="Insert into compose"
                      >
                        <ArrowRight className="size-2.5" />
                        Use
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(draft.id)}
                      className="rounded p-0.5 text-[var(--color-text-dim)]/50 hover:bg-white/[0.06] hover:text-red-400"
                      title="Delete draft"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!aiDraftLoading && visibleDrafts.length === 0 && (
            <div className="py-2 text-[11px] text-[var(--color-text-dim)]/60">
              No drafts yet. Generate one to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
