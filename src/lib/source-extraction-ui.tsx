/* eslint-disable react-refresh/only-export-components */

import {
  FileText,
  Video,
  GraduationCap,
  Globe,
  Archive,
  BookOpen,
  Presentation,
  Table,
} from "lucide-react";
import {
  isPdfUrl,
  isYouTubeUrl,
  isDocxUrl,
  isPptxUrl,
  isXlsxUrl,
  isEpubUrl,
  isArxivUrl,
  isWikipediaUrl,
} from "@/lib/url-classifiers";

export type SourceExtractionKind =
  | "youtube_transcript"
  | "pdf_text"
  | "docx_text"
  | "pptx_text"
  | "xlsx_text"
  | "epub_text"
  | "arxiv_paper"
  | "wikipedia_article"
  | "wayback_recovered"
  | "youtube_failed"
  | "pdf_failed"
  | "docx_failed"
  | "pptx_failed"
  | "xlsx_failed"
  | "epub_failed";

const BADGE_STYLES: Record<SourceExtractionKind, string> = {
  youtube_transcript:
    "border-rose-500/20 bg-rose-500/10 text-rose-300",
  pdf_text: "border-red-500/20 bg-red-500/10 text-red-300",
  docx_text: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  pptx_text: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  xlsx_text: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  epub_text: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
  arxiv_paper: "border-orange-500/20 bg-orange-500/10 text-orange-300",
  wikipedia_article: "border-neutral-500/20 bg-neutral-500/10 text-neutral-300",
  wayback_recovered: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  youtube_failed:
    "border-amber-500/20 bg-amber-500/10 text-amber-300",
  pdf_failed: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  docx_failed: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  pptx_failed: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  xlsx_failed: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  epub_failed: "border-amber-500/20 bg-amber-500/10 text-amber-300",
};

const BADGE_LABELS: Record<SourceExtractionKind, string> = {
  youtube_transcript: "Transcript",
  pdf_text: "PDF text",
  docx_text: "DOCX text",
  pptx_text: "Slides text",
  xlsx_text: "Spreadsheet",
  epub_text: "EPUB text",
  arxiv_paper: "ArXiv",
  wikipedia_article: "Wikipedia",
  wayback_recovered: "Wayback",
  youtube_failed: "No transcript",
  pdf_failed: "No PDF text",
  docx_failed: "No DOCX text",
  pptx_failed: "No slides text",
  xlsx_failed: "No spreadsheet",
  epub_failed: "No EPUB text",
};

const BADGE_TITLES: Record<SourceExtractionKind, string> = {
  youtube_transcript:
    "Full YouTube transcript was extracted via Advanced Search Bundle",
  pdf_text: "PDF text was extracted via Advanced Search Bundle",
  docx_text: "DOCX document text was extracted via Advanced Search Bundle",
  pptx_text: "PowerPoint slide text was extracted via Advanced Search Bundle",
  xlsx_text: "Spreadsheet cell data was extracted via Advanced Search Bundle",
  epub_text: "EPUB book text was extracted via Advanced Search Bundle",
  arxiv_paper: "ArXiv paper abstract and metadata were retrieved via direct API",
  wikipedia_article: "Wikipedia article content was retrieved via direct API",
  wayback_recovered:
    "Content was recovered from the Internet Archive Wayback Machine",
  youtube_failed: "YouTube transcript could not be extracted",
  pdf_failed: "PDF text could not be extracted",
  docx_failed: "DOCX text could not be extracted",
  pptx_failed: "PowerPoint slide text could not be extracted",
  xlsx_failed: "Spreadsheet data could not be extracted",
  epub_failed: "EPUB text could not be extracted",
};

const BADGE_ICONS: Record<SourceExtractionKind, typeof FileText> = {
  youtube_transcript: Video,
  pdf_text: FileText,
  docx_text: FileText,
  pptx_text: Presentation,
  xlsx_text: Table,
  epub_text: BookOpen,
  arxiv_paper: GraduationCap,
  wikipedia_article: Globe,
  wayback_recovered: Archive,
  youtube_failed: Video,
  pdf_failed: FileText,
  docx_failed: FileText,
  pptx_failed: Presentation,
  xlsx_failed: Table,
  epub_failed: BookOpen,
};

export function resolveWebSearchExtraction(source: {
  url: string;
  fetch?: {
    status: string;
    error_reason?: string;
    extraction_method?: string;
    via_wayback?: boolean;
    source_type?: string;
  };
}): SourceExtractionKind | null {
  const fetch = source.fetch;
  if (!fetch) return null;

  const succeeded = fetch.status === "ok";
  const failed = fetch.status !== "ok";

  // Check for Wayback recovery
  if (fetch.via_wayback && succeeded) {
    // Determine the content type from source_type or URL
    if (isYouTubeUrl(source.url)) return "wayback_recovered";
    if (isPdfUrl(source.url)) return "wayback_recovered";
    if (isDocxUrl(source.url)) return "wayback_recovered";
    if (isPptxUrl(source.url)) return "wayback_recovered";
    if (isXlsxUrl(source.url)) return "wayback_recovered";
    if (isEpubUrl(source.url)) return "wayback_recovered";
    return "wayback_recovered";
  }

  // ArXiv detection
  if (isArxivUrl(source.url)) {
    if (succeeded) return "arxiv_paper";
    return null; // ArXiv failures don't get a badge
  }

  // Wikipedia detection
  if (isWikipediaUrl(source.url)) {
    if (succeeded) return "wikipedia_article";
    return null;
  }

  if (isYouTubeUrl(source.url)) {
    if (succeeded) return "youtube_transcript";
    if (failed) return "youtube_failed";
  }
  if (isPdfUrl(source.url)) {
    if (succeeded) return "pdf_text";
    if (failed) return "pdf_failed";
  }
  if (isDocxUrl(source.url)) {
    if (succeeded) return "docx_text";
    if (failed) return "docx_failed";
  }
  if (isPptxUrl(source.url)) {
    if (succeeded) return "pptx_text";
    if (failed) return "pptx_failed";
  }
  if (isXlsxUrl(source.url)) {
    if (succeeded) return "xlsx_text";
    if (failed) return "xlsx_failed";
  }
  if (isEpubUrl(source.url)) {
    if (succeeded) return "epub_text";
    if (failed) return "epub_failed";
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
  const isDocx =
    source.sourceType === "docx" || isDocxUrl(source.url);
  const isPptx =
    source.sourceType === "pptx" || isPptxUrl(source.url);
  const isXlsx =
    source.sourceType === "xlsx" || isXlsxUrl(source.url);
  const isEpub =
    source.sourceType === "epub" || isEpubUrl(source.url);
  const isArxiv =
    source.sourceType === "arxiv" || isArxivUrl(source.url);
  const isWikipedia =
    source.sourceType === "wikipedia" || isWikipediaUrl(source.url);

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
  if (isPdf) {
    if (succeeded) return "pdf_text";
    if (failed) return "pdf_failed";
    return null;
  }
  if (isDocx) {
    if (succeeded) return "docx_text";
    if (failed) return "docx_failed";
    return null;
  }
  if (isPptx) {
    if (succeeded) return "pptx_text";
    if (failed) return "pptx_failed";
    return null;
  }
  if (isXlsx) {
    if (succeeded) return "xlsx_text";
    if (failed) return "xlsx_failed";
    return null;
  }
  if (isEpub) {
    if (succeeded) return "epub_text";
    if (failed) return "epub_failed";
    return null;
  }
  if (isArxiv && succeeded) return "arxiv_paper";
  if (isWikipedia && succeeded) return "wikipedia_article";

  return null;
}

export function countExtractions(
  kinds: Array<SourceExtractionKind | null | undefined>,
): {
  transcripts: number;
  pdfs: number;
  docx: number;
  pptx: number;
  xlsx: number;
  epub: number;
  arxiv: number;
  wikipedia: number;
  wayback: number;
} {
  let transcripts = 0;
  let pdfs = 0;
  let docx = 0;
  let pptx = 0;
  let xlsx = 0;
  let epub = 0;
  let arxiv = 0;
  let wikipedia = 0;
  let wayback = 0;
  for (const kind of kinds) {
    if (kind === "youtube_transcript") transcripts += 1;
    if (kind === "pdf_text") pdfs += 1;
    if (kind === "docx_text") docx += 1;
    if (kind === "pptx_text") pptx += 1;
    if (kind === "xlsx_text") xlsx += 1;
    if (kind === "epub_text") epub += 1;
    if (kind === "arxiv_paper") arxiv += 1;
    if (kind === "wikipedia_article") wikipedia += 1;
    if (kind === "wayback_recovered") wayback += 1;
  }
  return { transcripts, pdfs, docx, pptx, xlsx, epub, arxiv, wikipedia, wayback };
}

export function formatExtractionSummary(counts: {
  transcripts: number;
  pdfs: number;
  docx: number;
  pptx: number;
  xlsx: number;
  epub: number;
  arxiv: number;
  wikipedia: number;
  wayback: number;
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
  if (counts.docx > 0) {
    parts.push(`${counts.docx} DOCX`);
  }
  if (counts.pptx > 0) {
    parts.push(`${counts.pptx} slide deck${counts.pptx !== 1 ? "s" : ""}`);
  }
  if (counts.xlsx > 0) {
    parts.push(`${counts.xlsx} spreadsheet${counts.xlsx !== 1 ? "s" : ""}`);
  }
  if (counts.epub > 0) {
    parts.push(`${counts.epub} EPUB`);
  }
  if (counts.arxiv > 0) {
    parts.push(`${counts.arxiv} ArXiv`);
  }
  if (counts.wikipedia > 0) {
    parts.push(`${counts.wikipedia} Wikipedia`);
  }
  if (counts.wayback > 0) {
    parts.push(`${counts.wayback} Wayback`);
  }
  return parts.join(" · ");
}

type ResearchExtractionSource = Parameters<typeof resolveResearchExtraction>[0];

export function summarizeResearchExtractions(sources: ResearchExtractionSource[]): {
  counts: {
    transcripts: number;
    pdfs: number;
    docx: number;
    pptx: number;
    xlsx: number;
    epub: number;
    arxiv: number;
    wikipedia: number;
    wayback: number;
  };
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
          <Video className="size-3" />
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
      {counts.docx > 0 && (
        <span
          title="DOCX text extracted via Advanced Search Bundle"
          className="inline-flex items-center gap-1 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10.5px] font-medium text-blue-300"
        >
          <FileText className="size-3" />
          {counts.docx} DOCX
        </span>
      )}
      {counts.pptx > 0 && (
        <span
          title="PowerPoint slide text extracted via Advanced Search Bundle"
          className="inline-flex items-center gap-1 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10.5px] font-medium text-violet-300"
        >
          <Presentation className="size-3" />
          {counts.pptx} slide deck{counts.pptx !== 1 ? "s" : ""}
        </span>
      )}
      {counts.xlsx > 0 && (
        <span
          title="Spreadsheet data extracted via Advanced Search Bundle"
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-300"
        >
          <Table className="size-3" />
          {counts.xlsx} spreadsheet{counts.xlsx !== 1 ? "s" : ""}
        </span>
      )}
      {counts.epub > 0 && (
        <span
          title="EPUB text extracted via Advanced Search Bundle"
          className="inline-flex items-center gap-1 rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10.5px] font-medium text-indigo-300"
        >
          <BookOpen className="size-3" />
          {counts.epub} EPUB
        </span>
      )}
      {counts.arxiv > 0 && (
        <span
          title="ArXiv paper retrieved via direct API"
          className="inline-flex items-center gap-1 rounded-md border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10.5px] font-medium text-orange-300"
        >
          <GraduationCap className="size-3" />
          {counts.arxiv} ArXiv
        </span>
      )}
      {counts.wikipedia > 0 && (
        <span
          title="Wikipedia article retrieved via direct API"
          className="inline-flex items-center gap-1 rounded-md border border-neutral-500/20 bg-neutral-500/10 px-2 py-0.5 text-[10.5px] font-medium text-neutral-300"
        >
          <Globe className="size-3" />
          {counts.wikipedia} Wikipedia
        </span>
      )}
      {counts.wayback > 0 && (
        <span
          title="Content recovered from Internet Archive Wayback Machine"
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-medium text-amber-300"
        >
          <Archive className="size-3" />
          {counts.wayback} Wayback
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
  const Icon = BADGE_ICONS[kind] ?? FileText;
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
