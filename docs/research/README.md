# Research Module

Deep research pipeline with 9 phases. Supports multiple depth presets, plan approval, source scoring, contradiction detection, and citation auditing.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/research/research-types.ts` | Comprehensive type system |
| `src/modules/research/research-store.ts` | Zustand store with full CRUD |
| `src/modules/research/research-runtime.ts` | Research execution engine |
| `src/modules/research/research-lifecycle.ts` | Interrupted run handling |
| `src/modules/research/research-plan-phase.ts` | Plan generation |
| `src/modules/research/research-search-phase.ts` | Search execution |
| `src/modules/research/research-read-phase.ts` | Source reading |
| `src/modules/research/research-extract-phase.ts` | Evidence extraction |
| `src/modules/research/research-verify-phase.ts` | Claim verification |
| `src/modules/research/research-gap-phase.ts` | Gap analysis |
| `src/modules/research/research-synthesis-phase.ts` | Report synthesis |
| `src/modules/research/research-ai.ts` | LLM interaction utilities |
| `src/modules/research/research-claim-similarity.ts` | Claim deduplication |
| `src/modules/research/source-credibility.ts` | Source quality scoring |
| `src/modules/research/research-depth-config.ts` | Per-depth configuration |

## Research Depth Presets

| Preset | Description |
|--------|-------------|
| `lightning` | Quick overview, minimal sources |
| `quick` | Fast research with moderate depth |
| `standard` | Balanced research depth |
| `deep` | Thorough multi-source research |
| `exhaustive` | Maximum depth, all available sources |

Each preset configures: query limits, fetch limits, max sources, validation depth, and extraction thoroughness.

## The 9-Phase Pipeline

### Phase 1: Plan
- LLM generates a structured research plan
- Plan includes: steps, search queries per step, expected source types
- **Plan approval flow**: users can review and edit the plan before execution

### Phase 2: Search
- Executes searches using the web search orchestrator
- Multi-query planning: each step generates multiple search queries
- Concurrent execution with query concurrency limits

### Phase 3: Read
- Fetches and reads source content
- Content extraction via Tauri backend (PDF, HTML, etc.)
- Deduplication of identical sources

### Phase 4: Validate
- Scores source quality across 4 dimensions:
  - **Relevance**: How closely the source relates to the query
  - **Credibility**: Source authority and trustworthiness
  - **Currency**: How recent the information is
  - **Depth**: Level of detail provided
- Sources below quality thresholds are filtered out

### Phase 5: Extract
- Extracts evidence from validated sources
- Evidence types: claims, statistics, quotes, facts, methodologies
- Each evidence item is linked to its source

### Phase 6: Verify
- Cross-references claims across multiple sources
- **Contradiction detection**: Uses trigram-Jaccard similarity + LLM dedup
- Claims supported by multiple sources are marked as verified

### Phase 7: Gap Analysis
- Identifies missing information
- Generates follow-up queries to fill gaps
- If gaps are significant, the pipeline may loop back to search

### Phase 8: Synthesize
- Generates a cited report
- Citation maps link claims to sources
- Report structure follows academic conventions

### Phase 9: Finalize
- Saves the report
- Optional export to Documents module
- Optional export to Memory module as knowledge nodes

## Source Types

| Type | Description |
|------|-------------|
| `webpage` | General web page |
| `pdf` | PDF document |
| `news` | News article |
| `arxiv` | ArXiv paper |
| `wikipedia` | Wikipedia article |
| `government` | Government source |
| `academic` | Academic paper |
| `forum` | Forum discussion |
| `documentation` | Technical docs |
| `blog` | Blog post |
| `social` | Social media |
| `data` | Dataset or data source |
| `book` | Book excerpt |
| `patent` | Patent filing |
| `other` | Unclassified |

## Key Types

```typescript
interface ResearchRun {
  id: string
  query: string
  depth: ResearchDepth
  status: ResearchRunStatus
  planId?: string
  reportId?: string
  startedAt: number
  completedAt?: number
}

type ResearchRunStatus = 
  | 'planning' | 'searching' | 'reading' | 'extracting'
  | 'verifying' | 'synthesizing' | 'completed' | 'failed' | 'paused'

interface ResearchSource {
  id: string
  url: string
  title: string
  type: SourceType
  credibilityScore: number
  fetchedAt: number
}

interface ResearchEvidence {
  id: string
  sourceId: string
  claim: string
  type: EvidenceType
  confidence: number
}

interface ResearchClaim {
  id: string
  text: string
  supportingEvidence: string[]
  contradictingEvidence: string[]
  verified: boolean
}
```

## Pause/Resume

- Research runs can be paused mid-execution
- AbortController handles graceful shutdown
- Paused runs are reconciled on app close/reopen
- Interrupted runs transition to `paused` status

## Report Export

Reports can be exported to:
- **Documents**: Creates a new document with the synthesized report
- **Memory**: Extracts key findings as memory nodes
- **File**: Direct markdown/text export (via document export)
