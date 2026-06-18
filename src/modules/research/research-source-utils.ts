import type { ResearchDepth, ResearchSourceType } from "./research-types";
import type { FetchedPage } from "@/modules/web-search/tauri-commands";
import { isPdfUrl, isYouTubeUrl, isDocxUrl, isPptxUrl, isXlsxUrl, isEpubUrl, isArxivUrl, isWikipediaUrl } from "@/lib/url-classifiers";
import { estimateTokens } from "@/lib/context";
import type { FetchedSource } from "./research-storage";

// ── Source type classification & mapping ───────────────────────────────────

export function guessSourceType(url: string): ResearchSourceType {
  const lower = url.toLowerCase();
  if (isYouTubeUrl(url)) return "youtube";
  if (isPdfUrl(url)) return "pdf";
  if (isDocxUrl(url)) return "docx";
  if (isPptxUrl(url)) return "pptx";
  if (isXlsxUrl(url)) return "xlsx";
  if (isEpubUrl(url)) return "epub";
  if (isArxivUrl(url)) return "arxiv";
  if (isWikipediaUrl(url)) return "wikipedia";
  if (lower.includes("news") || lower.includes("bbc.com") || lower.includes("reuters.com") || lower.includes("cnn.com") || lower.includes("nytimes.com") || lower.includes("theguardian.com") || lower.includes("washingtonpost.com") || lower.includes("apnews.com") || lower.includes("bloomberg.com") || lower.includes("ft.com")) return "news";
  if (lower.includes("docs.") || lower.includes("documentation") || lower.includes("developer.mozilla.org") || lower.includes("learn.microsoft.com") || lower.includes("readthedocs.io")) return "docs";
  if (lower.includes("forum") || lower.includes("reddit.com") || lower.includes("stackoverflow.com") || lower.includes("discourse.org") || lower.includes("news.ycombinator.com") || lower.includes("quora.com")) return "forum";
  if (lower.includes("pubmed") || lower.includes("doi.org") || lower.includes("scholar.google") || lower.includes("semanticscholar.org") || lower.includes("jstor.org") || lower.includes("researchgate.net")) return "docs";
  if (lower.includes("github.com") || lower.includes("gitlab.com") || lower.includes("bitbucket.org")) return "github";
  if (lower.includes("npmjs.com") || lower.includes("pypi.org") || lower.includes("crates.io") || lower.includes("rubygems.org") || lower.includes("nuget.org")) return "package";
  return "webpage";
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function mapFetchedPageToSource(page: FetchedPage): FetchedSource {
  const ok = page.status === "ok";
  // Use backend-provided source_type when available, fall back to URL heuristics
  let contentType: string;
  if (page.source_type) {
    switch (page.source_type) {
      case "youtube": contentType = "text/plain"; break;
      case "pdf": contentType = "application/pdf"; break;
      case "docx": contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; break;
      case "pptx": contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"; break;
      case "xlsx": contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; break;
      case "epub": contentType = "application/epub+zip"; break;
      default: contentType = "text/html";
    }
  } else if (isYouTubeUrl(page.url)) {
    contentType = "text/plain";
  } else if (isPdfUrl(page.url)) {
    contentType = "application/pdf";
  } else {
    contentType = "text/html";
  }
  return {
    url: page.url,
    title: page.title ?? page.url,
    contentType,
    textContent: page.content ?? "",
    statusCode: ok ? 200 : 0,
    fetchedAt: nowIso(),
    ok,
    ...(page.error_reason ? { fetchError: `${page.status}: ${page.error_reason}` } : {}),
  };
}

export function truncateToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export function synthesisBudget(depth: ResearchDepth): { evidenceItems: number; outlineChars: number; sectionChars: number } {
  switch (depth) {
    case "lightning":   return { evidenceItems: 40,  outlineChars: 4_000,  sectionChars: 5_000 };
    case "quick":       return { evidenceItems: 80,  outlineChars: 6_000,  sectionChars: 8_000 };
    case "standard":    return { evidenceItems: 80,  outlineChars: 8_000,  sectionChars: 12_000 };
    case "deep":        return { evidenceItems: 160, outlineChars: 16_000, sectionChars: 24_000 };
    case "exhaustive":  return { evidenceItems: 300, outlineChars: 32_000, sectionChars: 40_000 };
  }
}

export function sourceTypeLabel(sourceType: string | undefined): string {
  switch (sourceType) {
    case "youtube": return "YouTube transcript";
    case "pdf": return "PDF document";
    case "docx": return "DOCX document";
    case "pptx": return "PowerPoint slides";
    case "xlsx": return "Spreadsheet";
    case "epub": return "EPUB book";
    case "arxiv": return "ArXiv paper";
    case "wikipedia": return "Wikipedia article";
    case "news": return "News article";
    case "docs": return "Documentation";
    case "github": return "GitHub";
    case "forum": return "Forum post";
    case "package": return "Package";
    default: return "Web page";
  }
}

export function sourceClassificationHint(sourceType: string | undefined): string {
  switch (sourceType) {
    case "youtube":
      return "This content is from a YouTube video transcript. Transcripts capture spoken dialogue — treat opinions and claims with skepticism, as they reflect the speaker's views rather than established facts. Timestamps and filler words may be present.";
    case "pdf":
      return "This content was extracted from a PDF document. PDFs can range from academic papers to corporate brochures — assess credibility based on the author and publisher.";
    case "docx":
      return "This content was extracted from a Word document. Consider who authored it and for what purpose — it could be anything from a research paper to internal notes.";
    case "pptx":
      return "This content was extracted from a PowerPoint presentation. Slide text is often bullet-point summaries — the content may be incomplete or lack full context.";
    case "xlsx":
      return "This content was extracted from a spreadsheet. Treat numerical data carefully — verify the data source and methodology if possible.";
    case "epub":
      return "This content was extracted from an EPUB e-book. Books are generally more thoroughly edited than web content, but assess the author's expertise and publication date.";
    case "arxiv":
      return "This content is from an ArXiv preprint. ArXiv papers are academic research that may not yet be peer-reviewed — treat findings as preliminary but cite them as research.";
    case "wikipedia":
      return "This content is from Wikipedia. Wikipedia is a curated secondary source — good for overview and established facts, but not a primary source. Verify critical claims independently.";
    case "news":
      return "This content is from a news article. News sources vary in editorial standards — assess the outlet's reputation and whether the claims are attributed to named sources.";
    case "docs":
      return "This content is from official documentation. Documentation is generally authoritative for technical details about the product or service it describes.";
    case "github":
      return "This content is from GitHub. Code and README files reflect the project's current state — assess whether the project is actively maintained.";
    default:
      return "This content was extracted from a web page. Assess the author, publication date, and whether claims are supported by evidence.";
  }
}

export function untrustedSourceBlock(label: string, text: string, sourceType?: string): string {
  const typeAttr = sourceType ? ` type="${sourceType}"` : "";
  return `<untrusted_source_content label="${label.replace(/"/g, "&quot;")}"${typeAttr}>\n${text}\n</untrusted_source_content>`;
}

export function chunkSourceText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const EXTRACT_CHUNK_TOKENS = 8000;
  const EXTRACT_CHUNK_OVERLAP_CHARS = 800;
  const MAX_EXTRACT_CHUNKS_PER_SOURCE = 4;
  if (estimateTokens(trimmed) <= EXTRACT_CHUNK_TOKENS) return [trimmed];

  const maxChars = EXTRACT_CHUNK_TOKENS * 4;
  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length && chunks.length < MAX_EXTRACT_CHUNKS_PER_SOURCE) {
    const end = Math.min(trimmed.length, start + maxChars);
    chunks.push(trimmed.slice(start, end));
    if (end >= trimmed.length) break;
    start = Math.max(0, end - EXTRACT_CHUNK_OVERLAP_CHARS);
  }
  return chunks;
}

export function fallbackSearchQueries(question: string): string[] {
  const cleaned = question.trim().replace(/\s+/g, " ");
  const year = new Date().getFullYear();
  return [
    cleaned,
    `${cleaned} official documentation`,
    `${cleaned} ${year} latest research`,
    `${cleaned} expert analysis review`,
    `${cleaned} comparison debate limitations`,
  ];
}

export function buildFallbackPlan(question: string): {
  clarifiedQuestion: string;
  keyConcepts: string[];
  steps: Array<Partial<import("./research-types").ResearchPlanStep>>;
} {
  const queries = fallbackSearchQueries(question);
  return {
    clarifiedQuestion: question.trim(),
    keyConcepts: question
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((word) => word.length > 3)
      .slice(0, 6),
    steps: [
      {
        title: "Establish authoritative background",
        description: "Find primary or authoritative sources that define the topic and key facts.",
        searchQueries: [queries[0], queries[1]],
        expectedSources: 5,
      },
      {
        title: "Collect recent independent evidence",
        description: "Find current analyses, reports, and reputable secondary sources for comparison.",
        searchQueries: [queries[2], queries[3]],
        expectedSources: 5,
      },
      {
        title: "Verify findings and identify caveats",
        description: "Compare sources for agreements, contradictions, dates, and weak evidence.",
        searchQueries: [`${question.trim()} comparison`, `${question.trim()} controversy limitations`],
        expectedSources: 4,
      },
    ],
  };
}
