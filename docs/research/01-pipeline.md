# Research Pipeline

Deep research pipeline with background research, 9 core phases, and citation auditing. Supports multiple depth presets, plan approval, source scoring, contradiction detection, and evidence extraction.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/research/research-types.ts` | Comprehensive type system |
| `src/modules/research/research-store.ts` | Zustand store with full CRUD |
| `src/modules/research/research-runtime.ts` | Research execution engine |
| `src/modules/research/research-runtime-context.ts` | Runtime context and state |
| `src/modules/research/research-lifecycle.ts` | Interrupted run handling |
| `src/modules/research/research-background-phase.ts` | Background research (Phase 0) |
| `src/modules/research/research-plan-phase.ts` | Plan generation (Phase 1) |
| `src/modules/research/research-search-phase.ts` | Search execution (Phase 2) |
| `src/modules/research/research-read-phase.ts` | Source reading (Phase 3) |
| `src/modules/research/research-verify-phase.ts` | Validate + Verify (Phases 4, 6) |
| `src/modules/research/research-extract-phase.ts` | Evidence extraction (Phase 5) |
| `src/modules/research/research-gap-phase.ts` | Gap analysis (Phase 7) |
| `src/modules/research/research-synthesis-phase.ts` | Report synthesis + Citation audit (Phase 8) |
| `src/modules/research/research-output-budgets.ts` | Per-phase output token budgets and scaling functions |

## Pipeline Phases

### Phase 0: Background Research
Searches for contextual snippets before the plan phase, providing the LLM with preliminary information.

### Phase 1: Plan
- LLM generates a structured research plan with steps, search queries, and expected source types
- **Plan approval flow**: users can review and edit the plan before execution

### Phase 2: Search
- Executes searches using the web search orchestrator
- Multi-query planning with concurrent execution and query limits per depth

### Phase 3: Read
- Fetches and reads source content via Tauri backend
- Deduplication of identical sources

### Phase 4: Validate
- Scores source quality across multiple dimensions (relevance, credibility, currency, depth)
- Sources below quality thresholds are filtered out

### Phase 5: Extract
- Extracts evidence from validated sources
- Evidence types: claims, statistics, quotes, facts, methodologies

### Phase 6: Verify
- Cross-references claims across multiple sources
- **Contradiction detection**: Trigram-Jaccard similarity + LLM dedup
- Claims supported by multiple sources are marked as verified

### Phase 7: Gap Analysis
- Identifies missing information and generates follow-up queries
- May loop back to search if significant gaps exist

### Phase 8: Synthesize + Citation Audit
- Generates a cited report with citation maps linking claims to sources
- **Citation Audit**: Full citation-accuracy audit against original sources, verifying every claim-reference mapping

### Phase 9: Finalize
- Saves the report and sets status to `completed`
- Optional export to Documents or Memory modules

The `ResumePhase` type in `research-runtime.ts` tracks: `"background" | "plan" | "search" | "read" | "validate" | "extract" | "verify" | "gap" | "synthesize"`.
