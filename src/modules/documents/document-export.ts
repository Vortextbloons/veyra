// Document export utilities

import type { DocumentRecord, DocumentType, DocumentStatus } from "./document-types";

export const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: "document", label: "Document" },
  { value: "technical_spec", label: "Technical Spec" },
  { value: "essay", label: "Essay" },
  { value: "report", label: "Report" },
  { value: "proposal", label: "Proposal" },
  { value: "readme", label: "README" },
  { value: "notes", label: "Notes" },
  { value: "prompt", label: "Prompt" },
  { value: "project_plan", label: "Project Plan" },
  { value: "meeting_notes", label: "Meeting Notes" },
  { value: "research_brief", label: "Research Brief" },
  { value: "agent_instruction", label: "Agent Instruction" },
];

export const DOCUMENT_STATUS_OPTIONS: { value: DocumentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "In Review" },
  { value: "final", label: "Final" },
  { value: "archived", label: "Archived" },
];

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
