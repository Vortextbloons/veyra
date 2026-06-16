import { FileText, Youtube } from "lucide-react";
import { isPdfUrl, isYouTubeUrl } from "@/lib/url-classifiers";

export type SourceExtractionKind =
  | "youtube_transcript"
  | "pdf_text"
  | "youtube_failed"
  | "pdf_failed";

const BADGE_STYLES: Record<SourceExtractionKind, string> = {
  youtube_transcript:
    "border-rose-500/20 bg-rose-500/10 text-rose-300",
  pdf_text: "border-red-500/20 bg-red-500/10 text-red-300",
  youtube_failed:
    "border-amber-500/20 bg-amber-500/10 text-amber-300",
  pdf_failed: "border-amber-500/20 bg-amber-500/10 text-amber-300",
};

const BADGE_LABELS: Record<SourceExtractionKind, string> = {
  youtube_transcript: "Transcript",
  pdf_text: "PDF text",
  youtube_failed: "No transcript",
  pdf_failed: "No PDF text",
};

const BADGE_TITLES: Record<SourceExtractionKind, string> = {
  youtube_transcript:
    "Full YouTube transcript was extracted via Advanced Search Bundle",
  pdf_text: "PDF text was extracted via Advanced Search Bundle",
  youtube_failed: "YouTube transcript could not be extracted",
  pdf_failed: "PDF text could not be extracted",
};

export function resolveWebSearchExtraction(source: {
  url: string;
  fetch?: { status: string; error_reason?: string };
}): SourceExtractionKind | null {
  const fetch = source.fetch;
  if (!fetch) return null;

  if (isYouTubeUrl(source.url)) {
    return fetch.status === "ok" ? "youtube_transcript" : "youtube_failed";
  }
  if (isPdfUrl(source.url)) {
    return fetch.status === "ok" ? "pdf_text" : "pdf_failed";
  }
  return null;
}

export function resolveResearchExtraction(source: {
  url: string;
  sourceType?: string;
  contentType?: string;
  status: string;
  error?: string;
  fullText?: string;
}): SourceExtractionKind | null {
  const isYoutube =
    source.sourceType === "youtube" || isYouTubeUrl(source.url);
  const isPdf =
    source.sourceType === "pdf" ||
    source.contentType === "application/pdf" ||
    isPdfUrl(source.url);

  if (!isYoutube && !isPdf) return null;

  const succeeded =
    (source.status === "read" || source.status === "fetched") &&
    !source.error &&
    Boolean(source.fullText?.trim());
  const failed = source.status === "failed" || Boolean(source.error);

  if (isYoutube) {
    if (succeeded) return "youtube_transcript";
    if (failed) return "youtube_failed";
    return null;
  }

  if (succeeded) return "pdf_text";
  if (failed) return "pdf_failed";
  return null;
}

export function countExtractions(
  kinds: Array<SourceExtractionKind | null | undefined>,
): { transcripts: number; pdfs: number } {
  let transcripts = 0;
  let pdfs = 0;
  for (const kind of kinds) {
    if (kind === "youtube_transcript") transcripts += 1;
    if (kind === "pdf_text") pdfs += 1;
  }
  return { transcripts, pdfs };
}

export function formatExtractionSummary(counts: {
  transcripts: number;
  pdfs: number;
}): string {
  const parts: string[] = [];
  if (counts.transcripts > 0) {
    parts.push(
      `${counts.transcripts} transcript${counts.transcripts !== 1 ? "s" : ""}`,
    );
  }
  if (counts.pdfs > 0) {
    parts.push(`${counts.pdfs} PDF${counts.pdfs !== 1 ? "s" : ""}`);
  }
  return parts.join(" · ");
}

type ResearchExtractionSource = Parameters<typeof resolveResearchExtraction>[0];

export function summarizeResearchExtractions(sources: ResearchExtractionSource[]): {
  counts: { transcripts: number; pdfs: number };
  kinds: SourceExtractionKind[];
  summary: string;
  hasIndicators: boolean;
} {
  const kinds = sources
    .map((source) => resolveResearchExtraction(source))
    .filter((kind): kind is SourceExtractionKind => kind !== null);
  const counts = countExtractions(kinds);
  const summary = formatExtractionSummary(counts);
  return {
    counts,
    kinds,
    summary,
    hasIndicators: kinds.length > 0,
  };
}

type ResearchExtractionIndicatorsProps = {
  sources: ResearchExtractionSource[];
  className?: string;
};

/** Run-level pills for Deep Research (header, progress area). */
export function ResearchExtractionIndicators({
  sources,
  className = "",
}: ResearchExtractionIndicatorsProps) {
  const { counts, hasIndicators } = summarizeResearchExtractions(sources);
  if (!hasIndicators) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {counts.transcripts > 0 && (
        <span
          title="YouTube transcripts extracted via Advanced Search Bundle"
          className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10.5px] font-medium text-rose-300"
        >
          <Youtube className="size-3" />
          {counts.transcripts} transcript{counts.transcripts !== 1 ? "s" : ""}
        </span>
      )}
      {counts.pdfs > 0 && (
        <span
          title="PDF text extracted via Advanced Search Bundle"
          className="inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10.5px] font-medium text-red-300"
        >
          <FileText className="size-3" />
          {counts.pdfs} PDF{counts.pdfs !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

type SourceExtractionBadgeProps = {
  kind: SourceExtractionKind;
  title?: string;
};

export function SourceExtractionBadge({ kind, title }: SourceExtractionBadgeProps) {
  const Icon = kind.startsWith("youtube") ? Youtube : FileText;
  return (
    <span
      title={title ?? BADGE_TITLES[kind]}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9.5px] font-medium ${BADGE_STYLES[kind]}`}
    >
      <Icon className="size-2.5" />
      {BADGE_LABELS[kind]}
    </span>
  );
}
