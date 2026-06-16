import { ExternalLink } from "lucide-react";
import type { ResearchSource, ResearchSourceStatus } from "../research-types";
import {
  countExtractions,
  formatExtractionSummary,
  resolveResearchExtraction,
  SourceExtractionBadge,
} from "@/lib/source-extraction-ui";

const STATUS_DOTS: Record<ResearchSourceStatus, string> = {
  discovered: "bg-[var(--color-text-dim)]/40",
  fetched: "bg-blue-400/60",
  read: "bg-emerald-400/60",
  failed: "bg-red-400/60",
  skipped: "bg-[var(--color-text-dim)]/20",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  webpage: "Web",
  pdf: "PDF",
  news: "News",
  docs: "Docs",
  github: "GitHub",
  wikipedia: "Wiki",
  forum: "Forum",
  package: "Package",
  youtube: "Video",
  unknown: "Other",
};

const SOURCE_TYPE_BADGES: Record<string, string> = {
  webpage: "bg-slate-500/10 text-slate-300 border-slate-500/20",
  pdf: "bg-red-500/10 text-red-300 border-red-500/20",
  news: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  docs: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  github: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  wikipedia: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  forum: "bg-pink-500/10 text-pink-300 border-pink-500/20",
  package: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  youtube: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  unknown: "bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)] border-[var(--color-text-dim)]/20",
};

type Props = {
  sources: ResearchSource[];
};

export function ResearchSourceList({ sources }: Props) {
  const sorted = [...sources].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const extractionSummary = formatExtractionSummary(
    countExtractions(sorted.map((source) => resolveResearchExtraction(source))),
  );

  return (
    <div className="flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">
          Sources
        </h2>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[11px] text-[var(--color-text-dim)]">
            {sources.length} total
          </span>
          {extractionSummary && (
            <span className="text-[10.5px] text-rose-300/80">{extractionSummary}</span>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-[12.5px] text-[var(--color-text-dim)]">
          No sources discovered yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((source) => {
            const extractionKind = resolveResearchExtraction(source);
            return (
            <div
              key={source.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5"
            >
              {/* Rank */}
              <span className="w-5 text-[11px] font-mono text-[var(--color-text-dim)]">
                {source.rank ?? "-"}
              </span>

              {/* Status dot */}
              <div className={`size-2 rounded-full ${STATUS_DOTS[source.status]}`} />

              {/* Title + URL */}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium text-[var(--color-text)]">
                  {source.title || "Untitled"}
                </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 truncate text-[11px] text-[var(--color-text-dim)] hover:text-[var(--color-accent)]"
                  title={source.url}
                >
                  <ExternalLink className="size-2.5" />
                  {source.url}
                </a>
                {(source.error || source.fetchStatus) && (
                  <span
                    className="mt-1 truncate text-[10.5px] text-amber-300/80"
                    title={source.error || source.fetchStatus}
                  >
                    {source.error || `Fetch: ${source.fetchStatus}`}
                  </span>
                )}
              </div>

              <span className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
                {source.status}
              </span>

              {/* Type badge */}
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                  SOURCE_TYPE_BADGES[source.sourceType] || SOURCE_TYPE_BADGES.unknown
                }`}
              >
                {SOURCE_TYPE_LABELS[source.sourceType] || source.sourceType}
              </span>

              {extractionKind && (
                <SourceExtractionBadge kind={extractionKind} />
              )}

              {source.sourceQuality && (
                <div
                  className="flex shrink-0 items-center gap-1.5"
                  title={source.sourceQuality.reason || "Validated source quality"}
                >
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                      source.sourceQuality.relevant
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/20 bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    Q{source.sourceQuality.quality}/5
                  </span>
                  {source.sourceQuality.credibilityScore !== undefined && (
                    <span className="text-[10px] text-[var(--color-text-dim)]">
                      Cred {source.sourceQuality.credibilityScore}/5
                    </span>
                  )}
                </div>
              )}

              {/* Score bar */}
              {source.score !== undefined && source.score > 0 && (
                <div className="flex w-16 items-center gap-1.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-[var(--color-accent)]/60"
                      style={{ width: `${Math.min(100, source.score * 100)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-[var(--color-text-dim)]">
                    {Math.round(source.score * 100)}
                  </span>
                </div>
              )}

              {/* Engine */}
              {source.engine && (
                <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
                  {source.engine}
                </span>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
