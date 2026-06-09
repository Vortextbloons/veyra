import { useState } from "react";
import { Tag, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import type { ResearchEvidence, ResearchEvidenceType } from "../research-types";

const TYPE_BADGES: Record<ResearchEvidenceType, string> = {
  claim: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  statistic: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  quote: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  fact: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  opinion: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  study: "bg-rose-500/10 text-rose-300 border-rose-500/20",
};

const TYPE_LABELS: Record<ResearchEvidenceType, string> = {
  claim: "Claim",
  statistic: "Statistic",
  quote: "Quote",
  fact: "Fact",
  opinion: "Opinion",
  study: "Study",
};

type Props = {
  evidence: ResearchEvidence[];
  sources: { id: string; title: string; url: string }[];
};

export function EvidenceCardsPanel({ evidence, sources }: Props) {
  if (evidence.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-[12.5px] text-[var(--color-text-dim)]">
        No evidence extracted yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
      {evidence.map((item) => (
        <EvidenceCard key={item.id} item={item} sources={sources} />
      ))}
    </div>
  );
}

function EvidenceCard({
  item,
  sources,
}: {
  item: ResearchEvidence;
  sources: { id: string; title: string; url: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const source = sources.find((s) => s.id === item.sourceId);

  const content = item.content;
  const isTruncated = content.length > 200;
  const displayContent = expanded || !isTruncated ? content : content.slice(0, 200) + "…";

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span
          className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${
            TYPE_BADGES[item.type]
          }`}
        >
          {TYPE_LABELS[item.type]}
        </span>
        <div className="flex items-center gap-1.5">
          <BarChart3 className="size-3 text-[var(--color-text-dim)]" />
          <div className="flex w-12 items-center gap-1">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full ${
                  item.confidence >= 0.8
                    ? "bg-emerald-500/60"
                    : item.confidence >= 0.5
                      ? "bg-amber-500/60"
                      : "bg-red-500/60"
                }`}
                style={{ width: `${Math.round(item.confidence * 100)}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-[var(--color-text-dim)]">
              {Math.round(item.confidence * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <p className="text-[12.5px] leading-relaxed text-[var(--color-text)]">
        {displayContent}
      </p>

      {isTruncated && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-3" /> Show more
            </>
          )}
        </button>
      )}

      {/* Source attribution */}
      {source && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5">
          <p className="truncate text-[11px] text-[var(--color-text-dim)]">
            {source.title}
          </p>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[10.5px] text-[var(--color-accent)] hover:underline"
          >
            {source.url}
          </a>
        </div>
      )}

      {/* Tags */}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <Tag className="size-3 text-[var(--color-text-dim)]" />
          {item.tags.map((tag, i) => (
            <span
              key={i}
              className="rounded-md bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
