import { useMemo, useState, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { FileText, BookOpen, Download, Brain } from "lucide-react";
import { MARKDOWN_COMPONENTS } from "@/components/markdown-components";
import type { Components } from "react-markdown";
import type { ResearchReport, ResearchSource, ResearchEvidence } from "../research-types";
import { useDocumentStore } from "@/modules/documents/document-store";
import { useMemoryStore } from "@/stores/memory-store";
import { useResearchStore } from "../research-store";
import { CitationInspector } from "./CitationInspector";
import { sanitizeReportSection, stripCitationAuditSection } from "../report-sanitize";

// Pre-process markdown to convert [N] citations into markdown links
function preprocessCitations(content: string): string {
  return content.replace(/\[(\d+)\]/g, "[$1](#cite-$1)");
}

type Props = {
  report: ResearchReport;
  sources: ResearchSource[];
  evidence: ResearchEvidence[];
  projectId?: string;
};

export function ResearchReportViewer({ report, sources, evidence, projectId }: Props) {
  const [activeCitation, setActiveCitation] = useState<{
    number: string;
    sourceId?: string;
  } | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const createDocument = useDocumentStore((s) => s.createDocument);
  const createMemoryNode = useMemoryStore((s) => s.createNode);
  const updateReport = useResearchStore((s) => s.updateReport);

  // Pre-processed markdown with citation links (strip internal audit appendix / leaked planning)
  const processedMarkdown = useMemo(() => {
    const cleaned = sanitizeReportSection(stripCitationAuditSection(report.contentMarkdown));
    return preprocessCitations(cleaned);
  }, [report.contentMarkdown]);

  // Build TOC from markdown headings
  const headings = useMemo(() => {
    const cleaned = stripCitationAuditSection(report.contentMarkdown);
    const matches = cleaned.matchAll(/^#{1,3}\s+(.+)$/gm);
    return Array.from(matches).map((m, index) => ({
      level: m[0].match(/^#+/)?.[0].length ?? 1,
      text: m[1].trim(),
      id: `heading-${index}`,
    }));
  }, [report.contentMarkdown]);

  const handleCitationClick = useCallback((number: string, sourceId?: string) => {
    setActiveCitation({ number, sourceId });
  }, []);

  const handleExportToDocument = async () => {
    try {
      setExportStatus(null);
      const exportMarkdown = sanitizeReportSection(stripCitationAuditSection(report.contentMarkdown));
      const doc = await createDocument({
        title: report.title,
        type: "report",
        contentMarkdown: exportMarkdown,
        projectId,
      });
      await updateReport({
        id: report.id,
        exportedToDocumentId: doc.id,
      });
      setExportStatus("Exported to Documents.");
    } catch (err) {
      console.error("Failed to export report to document:", err);
      setExportStatus(err instanceof Error ? err.message : "Failed to export report to document.");
    }
  };

  const handleExportToMemory = async () => {
    try {
      setExportStatus(null);
      // Ensure memory folders are loaded and find the first available folder
      const memoryStore = useMemoryStore.getState();
      if (memoryStore.folders.length === 0) {
        await memoryStore.hydrateMemory();
      }
      const firstFolder = memoryStore.folders[0];
      if (!firstFolder) {
        console.error("No memory folders available for export");
        setExportStatus("No memory folder is available for export.");
        return;
      }

      const memoryId = crypto.randomUUID();
      const summaryText = `Research report: ${report.title} (${report.wordCount} words, ${report.sourceIds.length} sources)`;
      const contentText =
        report.contentMarkdown.length > 20000
          ? report.contentMarkdown.slice(0, 20000) + "\n\n[Content truncated for memory storage]"
          : report.contentMarkdown;

      await createMemoryNode({
        id: memoryId,
        folderId: firstFolder.id,
        title: report.title,
        content: contentText,
        summary: summaryText,
        type: "project_fact",
        scope: projectId ? "project" : "global",
        projectId,
        tags: ["research", "report"],
        importance: 4,
        confidence: 0.9,
        sourceMessageIds: [],
        origin: "auto_extracted",
        status: "active",
      });

      const currentMemoryIds = report.exportedToMemoryIds ?? [];
      await updateReport({
        id: report.id,
        exportedToMemoryIds: [...currentMemoryIds, memoryId],
      });
      setExportStatus("Exported to Memory.");
    } catch (err) {
      console.error("Failed to export report to memory:", err);
      setExportStatus(err instanceof Error ? err.message : "Failed to export report to memory.");
    }
  };

  // Custom components for markdown rendering with citation support
  const components: Components = useMemo(() => {
    return {
      ...MARKDOWN_COMPONENTS,
      a({ href, children }) {
        if (typeof href === "string" && href.startsWith("#cite-")) {
          const number = href.replace("#cite-", "");
          const sourceId = report.citationMap[number];
          return (
            <button
              onClick={() => handleCitationClick(number, sourceId)}
              className="inline-flex items-center justify-center rounded bg-[var(--color-accent-soft)] px-1 text-[11px] font-medium leading-none text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/20"
              title={sourceId ? "View citation" : "Unknown citation"}
            >
              {children}
            </button>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline underline-offset-2 hover:text-[var(--color-accent)]/80"
          >
            {children}
          </a>
        );
      },
    };
  }, [report.citationMap, handleCitationClick]);

  return (
    <div className="flex h-full flex-col">
      {/* Report header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <FileText className="size-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">
              {report.title}
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-dim)]">
              <span className="flex items-center gap-1">
                <BookOpen className="size-3" />
                {report.wordCount.toLocaleString()} words
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="size-3" />
                {report.sourceIds.length} sources
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {exportStatus && (
            <span className="text-[11px] text-[var(--color-text-dim)]">{exportStatus}</span>
          )}
          <button
            type="button"
            onClick={handleExportToDocument}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] text-[var(--color-text)] transition-colors hover:bg-white/[0.03]"
          >
            <Download className="size-3.5" />
            Export to Document
          </button>
          <button
            type="button"
            onClick={handleExportToMemory}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] text-[var(--color-text)] transition-colors hover:bg-white/[0.03]"
          >
            <Brain className="size-3.5" />
            Export to Memory
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* TOC sidebar */}
        {headings.length > 0 && (
          <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-dim)]">
              Contents
            </h3>
            <nav className="flex flex-col gap-1">
              {headings.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(h.id);
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`text-left text-[12px] transition-colors hover:text-white ${
                    h.level === 1
                      ? "font-medium text-[var(--color-text)]"
                      : h.level === 2
                        ? "pl-2 text-[var(--color-text-dim)]"
                        : "pl-4 text-[var(--color-text-dim)]"
                  }`}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Report content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="markdown-rendered mx-auto max-w-3xl">
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={components}
            >
              {processedMarkdown}
            </Markdown>
          </div>
        </div>
      </div>

      {/* Citation inspector overlay */}
      {activeCitation && (
        <CitationInspector
          citationNumber={activeCitation.number}
          sourceId={activeCitation.sourceId}
          sources={sources}
          evidence={evidence}
          onClose={() => setActiveCitation(null)}
        />
      )}
    </div>
  );
}
