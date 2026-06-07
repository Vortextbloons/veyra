// Document templates for different document types

import type { DocumentType } from "./document-types";

export type DocumentTemplate = {
  type: DocumentType;
  label: string;
  description: string;
  sections: string[];
};

export const DOCUMENT_TEMPLATES: Record<DocumentType, DocumentTemplate> = {
  document: {
    type: "document",
    label: "Document",
    description: "General purpose document",
    sections: ["Introduction", "Body", "Conclusion"],
  },
  technical_spec: {
    type: "technical_spec",
    label: "Technical Specification",
    description: "Technical specification for a feature or system",
    sections: [
      "Overview",
      "Goals",
      "Non-Goals",
      "User Experience",
      "Architecture",
      "Data Models",
      "Storage",
      "MVP Plan",
      "Acceptance Criteria",
    ],
  },
  essay: {
    type: "essay",
    label: "Essay",
    description: "Structured essay or article",
    sections: ["Introduction", "Background", "Argument", "Counterarguments", "Conclusion"],
  },
  report: {
    type: "report",
    label: "Report",
    description: "Formal report with findings and recommendations",
    sections: [
      "Executive Summary",
      "Introduction",
      "Methodology",
      "Findings",
      "Analysis",
      "Recommendations",
      "Conclusion",
    ],
  },
  proposal: {
    type: "proposal",
    label: "Proposal",
    description: "Project or business proposal",
    sections: [
      "Executive Summary",
      "Problem Statement",
      "Proposed Solution",
      "Scope",
      "Timeline",
      "Budget",
      "Risks",
      "Conclusion",
    ],
  },
  readme: {
    type: "readme",
    label: "README",
    description: "Project README file",
    sections: [
      "Overview",
      "Features",
      "Installation",
      "Usage",
      "Configuration",
      "Contributing",
      "License",
    ],
  },
  notes: {
    type: "notes",
    label: "Notes",
    description: "Quick notes or meeting notes",
    sections: ["Notes"],
  },
  prompt: {
    type: "prompt",
    label: "Prompt",
    description: "AI prompt or instruction template",
    sections: ["Context", "Instructions", "Examples", "Constraints"],
  },
  project_plan: {
    type: "project_plan",
    label: "Project Plan",
    description: "Project planning document",
    sections: [
      "Project Overview",
      "Objectives",
      "Scope",
      "Milestones",
      "Timeline",
      "Resources",
      "Risks",
      "Success Criteria",
    ],
  },
  meeting_notes: {
    type: "meeting_notes",
    label: "Meeting Notes",
    description: "Meeting notes with action items",
    sections: ["Attendees", "Agenda", "Discussion", "Decisions", "Action Items"],
  },
  research_brief: {
    type: "research_brief",
    label: "Research Brief",
    description: "Research summary or brief",
    sections: [
      "Research Question",
      "Background",
      "Methodology",
      "Key Findings",
      "Analysis",
      "Conclusions",
      "References",
    ],
  },
  agent_instruction: {
    type: "agent_instruction",
    label: "Agent Instruction",
    description: "Instructions for an AI agent",
    sections: ["Role", "Capabilities", "Instructions", "Constraints", "Examples"],
  },
};

/**
 * Generate a markdown template string from a document type.
 * Creates heading structure with placeholder content.
 */
export function generateTemplateMarkdown(type: DocumentType, title: string): string {
  const template = DOCUMENT_TEMPLATES[type];
  if (!template) {
    return `# ${title}\n\n`;
  }

  const headings = template.sections.map((section) => `## ${section}\n\n`).join("");
  return `# ${title}\n\n${headings}`;
}

/**
 * Get all available document types as an array.
 */
export function getDocumentTypes(): DocumentTemplate[] {
  return Object.values(DOCUMENT_TEMPLATES);
}

/**
 * Get a template by type.
 */
export function getTemplate(type: DocumentType): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES[type];
}
