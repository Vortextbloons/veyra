// Document export utilities

import type { DocumentRecord } from "./document-types";

/**
 * Build a safe filename from a document title.
 * Removes special characters and limits length.
 */
export function buildExportFilename(doc: DocumentRecord, extension: "md" | "txt"): string {
  const safeName = doc.title
    .replace(/[^a-zA-Z0-9\s_-]/g, "") // remove special chars
    .replace(/\s+/g, "_") // spaces to underscores
    .slice(0, 60) // limit length
    .toLowerCase();

  const timestamp = new Date(doc.updatedAt).toISOString().split("T")[0]; // YYYY-MM-DD
  return `${safeName}_${timestamp}.${extension}`;
}

/**
 * Format a document status for display.
 */
export function formatDocumentStatus(status: DocumentRecord["status"]): string {
  const statusLabels: Record<DocumentRecord["status"], string> = {
    draft: "Draft",
    review: "In Review",
    final: "Final",
    archived: "Archived",
  };
  return statusLabels[status] || status;
}

/**
 * Format a document type for display.
 */
export function formatDocumentType(type: DocumentRecord["type"]): string {
  const typeLabels: Record<DocumentRecord["type"], string> = {
    document: "Document",
    technical_spec: "Technical Spec",
    essay: "Essay",
    report: "Report",
    proposal: "Proposal",
    readme: "README",
    notes: "Notes",
    prompt: "Prompt",
    project_plan: "Project Plan",
    meeting_notes: "Meeting Notes",
    research_brief: "Research Brief",
    agent_instruction: "Agent Instruction",
  };
  return typeLabels[type] || type;
}

/**
 * Format a timestamp for display.
 */
export function formatDocumentDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a version number for display.
 */
export function formatVersionNumber(version: number): string {
  return `v${version}`;
}
