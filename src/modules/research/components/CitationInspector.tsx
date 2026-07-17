import { X, ExternalLink, BarChart3 } from "lucide-react";
import type { ResearchSource, ResearchEvidence } from "../research-types";
import { DialogSurface } from "@/components/dialog-surface";

type Props = {
  citationNumber: string;
  sourceId?: string;
  sources: ResearchSource[];
  evidence: ResearchEvidence[];
  onClose: () => void;
};

export function CitationInspector({
  citationNumber,
  sourceId,
  sources,
  evidence,
  onClose,
}: Props) {
  const source = sourceId ? sources.find((s) => s.id === sourceId) : undefined;
  const relatedEvidence = sourceId
    ? evidence.filter((e) => e.sourceId === sourceId)
    : [];

  return (
    <DialogSurface
      onClose={onClose}
      ariaLabelledBy="citation-inspector-title"
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      panelClassName="flex w-full max-w-md flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
    >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md bg-[var(--color-accent-soft)] text-[11px] font-semibold text-[var(--color-accent)]">
              [{citationNumber}]
            </span>
            <h3 id="citation-inspector-title" className="text-[14px] font-semibold text-[var(--color-text)]">
              Citation Details
            </h3>
          </div>
          <button
            type="button"
            aria-label="Close citation details"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 p-5">
          {!source ? (
            <div className="text-[12.5px] text-[var(--color-text-dim)]">
              Source not found for this citation.
            </div>
          ) : (
            <>
              {/* Source info */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
                    Source
                  </span>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                      source.status === "read"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : "border-[var(--color-border)] bg-white/[0.03] text-[var(--color-text-dim)]"
                    }`}
                  >
                    {source.status}
                  </span>
                </div>
                <h4 className="text-[13px] font-medium text-[var(--color-text)]">
                  {source.title || "Untitled"}
                </h4>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[12px] text-[var(--color-accent)] hover:underline"
                >
                  <ExternalLink className="size-3" />
                  {source.url}
                </a>
              </div>

              {/* Evidence snippets */}
              {relatedEvidence.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
                    Supporting Evidence
                  </span>
                  {relatedEvidence.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
                    >
                      <p className="text-[12px] leading-relaxed text-[var(--color-text)]">
                        {ev.content}
                      </p>
                      <div className="mt-2 flex items-center gap-1">
                        <BarChart3 className="size-3 text-[var(--color-text-dim)]" />
                        <span className="text-[11px] text-[var(--color-text-dim)]">
                          Confidence: {Math.round(ev.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {relatedEvidence.length === 0 && (
                <p className="text-[12px] text-[var(--color-text-dim)]">
                  No specific evidence snippets linked to this source.
                </p>
              )}
            </>
          )}
        </div>
    </DialogSurface>
  );
}
