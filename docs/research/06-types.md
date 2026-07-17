# Research Key Types

From `src/modules/research/research-types.ts`:

```typescript
type ResearchDepth = "lightning" | "quick" | "standard" | "deep" | "exhaustive";

type ResearchRunStatus =
  | "planning" | "searching" | "reading" | "extracting"
  | "verifying" | "synthesizing" | "completed" | "failed" | "paused";

type ResearchSourceType =
  | "webpage" | "pdf" | "news" | "docs" | "github"
  | "wikipedia" | "forum" | "package" | "youtube" | "arxiv"
  | "epub" | "docx" | "pptx" | "xlsx" | "unknown";

type ResearchSourceStatus =
  | "discovered" | "fetched" | "read" | "failed" | "skipped";

type ResearchStepType =
  | "clarify" | "plan" | "background" | "search" | "read"
  | "extract" | "verify" | "synthesize" | "report" | "follow_up";

type ResearchStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

type ResearchEvidenceType =
  | "claim" | "statistic" | "quote" | "fact" | "methodology" | "example" | "counter";

interface ResearchRun {
  id: string;
  question: string;
  depth: ResearchDepth;
  status: ResearchRunStatus;
  plan?: ResearchPlan;
  reportId?: string;
  projectId?: string;
  progressPercent: number;
  modelUsed?: string;
  providerId?: string;
  totalTokensUsed?: number;
  searchProvider?: string;
  currentStepId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface ResearchSource {
  id: string;
  url: string;
  title: string;
  sourceType: ResearchSourceType;
  sourceQuality?: {
    relevant: boolean;
    quality: number;
    relevanceScore?: number;
  };
  fetchedAt?: string;
}

interface ResearchEvidence {
  id: string;
  sourceId: string;
  claim: string;
  type: ResearchEvidenceType;
  confidence: number;
  context?: string;
  pageNumber?: string;
  tags?: string[];
  stepId?: string;
}

interface ResearchClaim {
  id: string;
  text: string;
  evidenceId: string;
  sourceId: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  verified: boolean;
  verifiedBy?: string;
  contradictedBy?: string;
  disputedBy?: string;
  needsSemanticReview?: boolean;
  verificationReason?: string;
}
```
