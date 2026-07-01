import type { DocumentType } from "./document-types";

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  type: DocumentType;
  contentMarkdown: string;
  tags: string[];
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "tpl-readme",
    name: "README",
    description: "Standard project README with installation, usage, and API sections.",
    type: "readme",
    contentMarkdown: `# Project Name

A brief description of what this project does.

## Installation

\`\`\`bash
npm install project-name
\`\`\`

## Usage

\`\`\`javascript
import { something } from 'project-name';
\`\`\`

## API

### \`functionName(params)\`

Description of the function.

- **param1** - Description
- **param2** - Description

**Returns:** Description of return value.

## License

MIT
`,
    tags: ["template", "readme"],
  },
  {
    id: "tpl-technical-spec",
    name: "Technical Spec",
    description: "Technical specification document for feature design.",
    type: "technical_spec",
    contentMarkdown: `# Feature Name — Technical Specification

## Overview

Brief description of the feature.

## Goals

- Goal 1
- Goal 2

## Non-Goals

- Non-goal 1

## Architecture

### Components

#### Component 1

Description.

### Data Flow

1. Step one
2. Step two

## API Design

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/resource | List resources |

## Database Schema

\`\`\`sql
CREATE TABLE example (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
\`\`\`

## Security Considerations

- Consideration 1

## Open Questions

- [ ] Question 1
`,
    tags: ["template", "technical-spec"],
  },
  {
    id: "tpl-meeting-notes",
    name: "Meeting Notes",
    description: "Structured meeting notes with attendees, agenda, and action items.",
    type: "meeting_notes",
    contentMarkdown: `# Meeting Notes — [Date]

## Attendees

- Person 1
- Person 2

## Agenda

1. Topic 1
2. Topic 2

## Discussion

### Topic 1

Notes about topic 1.

### Topic 2

Notes about topic 2.

## Decisions

- Decision 1
- Decision 2

## Action Items

- [ ] Action item 1 — @person — Due: date
- [ ] Action item 2 — @person — Due: date

## Next Meeting

Date: [date]
Agenda: [topics]
`,
    tags: ["template", "meeting-notes"],
  },
  {
    id: "tpl-project-plan",
    name: "Project Plan",
    description: "Project plan with milestones, timeline, and deliverables.",
    type: "project_plan",
    contentMarkdown: `# Project Plan — [Project Name]

## Overview

Project description and objectives.

## Timeline

### Phase 1: [Name] (Week 1-2)

- [ ] Deliverable 1
- [ ] Deliverable 2

### Phase 2: [Name] (Week 3-4)

- [ ] Deliverable 3
- [ ] Deliverable 4

### Phase 3: [Name] (Week 5-6)

- [ ] Deliverable 5

## Resources

| Resource | Allocation | Notes |
|----------|------------|-------|
| Person 1 | 50% | Frontend |
| Person 2 | 100% | Backend |

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Risk 1 | High | Low | Mitigation plan |

## Success Criteria

- Criterion 1
- Criterion 2
`,
    tags: ["template", "project-plan"],
  },
];
