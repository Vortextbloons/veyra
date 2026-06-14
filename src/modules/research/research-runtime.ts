import type { ChatMessage } from "@/lib/chat-types";
import { getProviderAdapter } from "@/lib/providers";
import { runSearch } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { estimateTokens } from "@/lib/context";
import { useResearchStore } from "./research-store";
import { updateResearchSourceAfterFetch, type FetchedSource } from "./research-storage";
import { invokeFetchAndExtractPages, type FetchedPage } from "@/modules/web-search/tauri-commands";
import type {
  ResearchDepth,
  ResearchRun,
  ResearchStep,
  ResearchSource,
  ResearchEvidence,
  ResearchClaim,
  ResearchContradiction,
  CreateResearchSourceInput,
  CreateResearchEvidenceInput,
  CreateResearchClaimInput,
  CreateResearchContradictionInput,
  CreateResearchReportInput,
  UpdateResearchRunInput,
  ResearchPlan,
  ResearchPlanStep,
  ResearchSourceType,
  ResearchStepType,
  ResearchStepStatus,
  ResearchSourceStatus,
  ResearchClaimStatus,
  ResearchEvidenceType,
  ResearchRunStatus,
} from "./research-types";

// ── Events ───────────────────────────────────────────────────────────────────

type ResearchRuntimeEvent =
  | { type: "phase_start"; phase: string; stepId: string }
  | { type: "phase_complete"; phase: string; stepId: string }
  | { type: "phase_error"; phase: string; stepId: string; error: string }
  | { type: "search_complete"; query: string; sourceCount: number }
  | { type: "source_fetched"; sourceId: string; title: string }
  | { type: "source_validated"; sourceId: string; quality: number; relevant: boolean }
  | { type: "evidence_extracted"; evidenceId: string; evidenceType: string; content: string }
  | { type: "claim_verified"; claimId: string; status: string; supportingSources: number; contradictingSources: number }
  | { type: "contradiction_found"; contradictionId: string; claimA: string; claimB: string }
  | { type: "report_progress"; percent: number }
  | { type: "report_complete"; reportId: string }
  | { type: "error"; error: string };

// ── Depth configuration ────────────────────────────────────────────────────

type DepthConfig = {
  maxSearchRounds: number;
  maxSources: number;
  maxSourcesPerRound: number;
  verify: boolean;
  followUp: boolean;
  adaptiveDeepening: boolean;
  minSourceQuality: number; // 1-5
  perSourceRead: boolean;
  crossSourceVerify: boolean;
  gapAnalysis: boolean;
};

function getDepthConfig(depth: ResearchDepth): DepthConfig {
  switch (depth) {
    case "quick":
      return { maxSearchRounds: 3, maxSources: 35, maxSourcesPerRound: 12, verify: false, followUp: false, adaptiveDeepening: false, minSourceQuality: 2, perSourceRead: false, crossSourceVerify: false, gapAnalysis: false };
    case "standard":
      return { maxSearchRounds: 5, maxSources: 75, maxSourcesPerRound: 15, verify: true, followUp: false, adaptiveDeepening: false, minSourceQuality: 3, perSourceRead: true, crossSourceVerify: true, gapAnalysis: false };
    case "deep":
      return { maxSearchRounds: 8, maxSources: 150, maxSourcesPerRound: 19, verify: true, followUp: true, adaptiveDeepening: true, minSourceQuality: 3, perSourceRead: true, crossSourceVerify: true, gapAnalysis: true };
    case "exhaustive":
      return { maxSearchRounds: 10, maxSources: 300, maxSourcesPerRound: 30, verify: true, followUp: true, adaptiveDeepening: true, minSourceQuality: 4, perSourceRead: true, crossSourceVerify: true, gapAnalysis: true };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeChatMessage(role: "system" | "user", content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  };
}

function safeJsonParse<T>(text: string): T | null {
  const candidates = extractJsonCandidates(text);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  try { return JSON.stringify(error); } catch { return String(error); }
}

function getTemporalContext(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.toLocaleString("en-US", { month: "long" });
  const day = now.getDate();
  return `Current date: ${month} ${day}, ${year}. When generating search queries, prefer recent sources (last 1-2 years) unless the topic requires historical data. Use date-specific queries (e.g., "${year}", "latest", "recent") when recency matters. When evaluating source currency, consider that information older than 2-3 years may be outdated for fast-moving topics.`;
}

function normalizeEvidenceArray(parsed: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object") {
    for (const key of ["evidence", "items", "results", "findings", "data"]) {
      const val = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as Array<Record<string, unknown>>;
    }
  }
  return null;
}

function extractJsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates: string[] = [];
  const codeBlockMatches = trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi);
  for (const match of codeBlockMatches) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }
  candidates.push(trimmed);

  const balancedObject = extractBalancedJson(trimmed, "{", "}");
  if (balancedObject) candidates.push(balancedObject);
  const balancedArray = extractBalancedJson(trimmed, "[", "]");
  if (balancedArray) candidates.push(balancedArray);

  return Array.from(new Set(candidates));
}

function extractBalancedJson(text: string, open: "{" | "[", close: "}" | "]"): string | null {
  const start = text.indexOf(open);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === open) depth++;
    else if (char === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function fallbackSearchQueries(question: string): string[] {
  const cleaned = question.trim().replace(/\s+/g, " ");
  return [
    cleaned,
    `${cleaned} official documentation`,
    `${cleaned} recent analysis`,
    `${cleaned} evidence sources`,
  ];
}

function buildFallbackPlan(question: string): {
  clarifiedQuestion: string;
  keyConcepts: string[];
  steps: Array<Partial<ResearchPlanStep>>;
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

function guessSourceType(url: string): ResearchSourceType {
  const lower = url.toLowerCase();
  if (lower.includes("wikipedia.org")) return "wikipedia";
  if (lower.includes("github.com")) return "github";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.includes("news") || lower.includes("bbc.com") || lower.includes("reuters.com") || lower.includes("cnn.com") || lower.includes("nytimes.com")) return "news";
  if (lower.includes("docs.") || lower.includes("documentation")) return "docs";
  if (lower.includes("forum") || lower.includes("reddit.com") || lower.includes("stackoverflow.com")) return "forum";
  if (lower.includes("arxiv.org") || lower.includes("pubmed") || lower.includes("doi.org") || lower.includes("scholar.google")) return "docs";
  return "webpage";
}

function assessDomainAuthority(url: string): number {
  const lower = url.toLowerCase();
  // High authority domains
  if (lower.includes(".edu") || lower.includes(".gov") || lower.includes("arxiv.org") || lower.includes("pubmed.ncbi.nlm.nih.gov") || lower.includes("who.int") || lower.includes("nature.com") || lower.includes("science.org")) return 5;
  if (lower.includes("wikipedia.org") || lower.includes("reuters.com") || lower.includes("apnews.com") || lower.includes("bbc.com") || lower.includes("economist.com")) return 4;
  if (lower.includes("github.com") || lower.includes("stackoverflow.com") || lower.includes("medium.com") || lower.includes("substack.com")) return 3;
  if (lower.includes("blog") || lower.includes("forum") || lower.includes("reddit.com")) return 2;
  return 3; // Default for unknown
}

function nowIso(): string {
  return new Date().toISOString();
}

const RESEARCH_FETCH_TIMEOUT_SECS = 15;
const RESEARCH_FETCH_MAX_CHARS = 50_000;
const RESEARCH_FETCH_CONCURRENCY = 3;

function mapFetchedPageToSource(page: FetchedPage): FetchedSource {
  const ok = page.status === "ok";
  return {
    url: page.url,
    title: page.title ?? page.url,
    contentType: "text/html",
    textContent: page.content ?? "",
    statusCode: ok ? 200 : 0,
    fetchedAt: nowIso(),
    ok,
    ...(page.error_reason ? { fetchError: `${page.status}: ${page.error_reason}` } : {}),
  };
}

function truncateToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const maxChars = maxTokens * 4;
  return text.slice(0, maxChars);
}

function extractCitationContext(reportMarkdown: string, citationNumber: number): string {
  // Find the citation and extract surrounding text
  const citationPattern = new RegExp(`\\[${citationNumber}\\]`, "g");
  let bestContext = "";
  let match;
  while ((match = citationPattern.exec(reportMarkdown)) !== null) {
    const start = Math.max(0, match.index - 400);
    const end = Math.min(reportMarkdown.length, match.index + 400);
    const context = reportMarkdown.slice(start, end).trim();
    if (context.length > bestContext.length) {
      bestContext = context;
    }
  }
  return bestContext || `Citation [${citationNumber}] found in report`;
}

// ── AI helper ────────────────────────────────────────────────────────────────

async function callResearchAi(
  messages: Array<{ role: "system" | "user"; content: string }>,
  signal: AbortSignal,
  onChunk?: (chunk: string) => void,
  maxTokens?: number,
): Promise<string> {
  const providerState = useProviderStore.getState();
  const selectedProvider = providerState.selectedProvider;
  const selectedModel = providerState.selectedModel;

  if (!selectedProvider || !selectedModel) {
    throw new Error("No provider or model selected");
  }

  const adapter = getProviderAdapter(selectedProvider);
  if (!adapter) {
    throw new Error(`Provider ${selectedProvider} not found`);
  }

  const settings = useSettingsStore.getState();
  const modelSettings = settings.getModelSettings(selectedModel);

  const chatMessages: ChatMessage[] = messages.map((m) => makeChatMessage(m.role, m.content));

  return new Promise((resolve, reject) => {
    let fullText = "";

    adapter
      .sendChat({
        messages: chatMessages,
        model: selectedModel,
        temperature: 0.2, // Lower temperature for more factual, deterministic output
        contextLength: modelSettings.contextLength || undefined,
        maxTokens: maxTokens || modelSettings.maxTokens || undefined,
        topP: 0.9,
        repetitionPenalty: 1.0,
        stopSequences: modelSettings.stopSequences || undefined,
        toolChoice: "none",
        signal,
        onChunk: (content) => {
          fullText += content;
          onChunk?.(content);
        },
        onReasoningChunk: () => {},
        onError: (error) => {
          reject(new Error(error));
        },
        onComplete: () => {
          resolve(fullText.trim());
        },
      })
      .catch((error) => reject(error));
  });
}

// ── Main orchestrator ──────────────────────────────────────────────────────

export type ResumePhase = "plan" | "search" | "read" | "extract" | "verify" | "gap" | "synthesize";

export async function executeResearchRun(
  run: ResearchRun,
  signal: AbortSignal,
  onEvent: (event: ResearchRuntimeEvent) => void,
  resumeFromPhase?: ResumePhase,
): Promise<void> {
  const store = useResearchStore.getState();
  const config = getDepthConfig(run.depth);

  const sources: ResearchSource[] = [];
  const evidenceList: ResearchEvidence[] = [];
  const claims: ResearchClaim[] = [];
  const contradictions: ResearchContradiction[] = [];
  const searchQueriesUsed: string[] = [];

  // On resume, pre-populate arrays from persisted state
  if (resumeFromPhase && store.activeRun) {
    const existing = store.activeRun;
    sources.push(...existing.sources);
    evidenceList.push(...existing.evidence);
    claims.push(...existing.claims);
    contradictions.push(...existing.contradictions);
    // Mark any "running" steps from the aborted execution as failed
    for (const step of existing.steps) {
      if (step.status === "running") {
        await store.updateStep({ id: step.id, status: "failed", error: "Interrupted — resumed", completedAt: nowIso() });
      }
    }
  }

  function checkAbort(): void {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  }

  async function updateRunStatus(
    status: ResearchRunStatus,
    progressPercent: number,
    extra?: Partial<UpdateResearchRunInput>,
  ): Promise<void> {
    await store.updateRun({
      id: run.id,
      status,
      progressPercent,
      ...extra,
    });
  }

  async function createStep(
    type: ResearchStepType,
    title: string,
    detail?: string,
  ): Promise<ResearchStep> {
    const step = await store.createStep({
      runId: run.id,
      type,
      title,
      detail,
    });
    await store.updateStep({
      id: step.id,
      status: "running",
      startedAt: nowIso(),
    });
    return { ...step, status: "running" as ResearchStepStatus };
  }

  async function completeStep(
    step: ResearchStep,
    output?: string,
    tokensUsed?: number,
  ): Promise<void> {
    await store.updateStep({
      id: step.id,
      status: "completed",
      output,
      completedAt: nowIso(),
      tokensUsed,
    });
  }

  async function failStep(
    step: ResearchStep,
    error: string,
  ): Promise<void> {
    await store.updateStep({
      id: step.id,
      status: "failed",
      error,
      completedAt: nowIso(),
    });
  }

  try {
    // ── Phase 1: Clarify & Plan ───────────────────────────────────────────
    checkAbort();
    const planStep = await createStep("plan", "Planning research strategy");
    onEvent({ type: "phase_start", phase: "plan", stepId: planStep.id });
    await updateRunStatus("planning", 5);

    let planSteps: ResearchPlanStep[] = [];

    // If resuming with an existing approved plan, reuse it
    if (resumeFromPhase && run.plan?.userApproved) {
      planSteps = run.plan.steps;
      await completeStep(planStep, `Resumed with existing plan: ${planSteps.length} steps`);
      onEvent({ type: "phase_complete", phase: "plan", stepId: planStep.id });
    } else {

    const planPrompt = `You are an expert research strategist. Your task is to create a comprehensive, multi-step research plan for the following question.

Analyze the question carefully. Identify:
1. The core concepts and sub-questions
2. What types of sources would be most authoritative (academic, government, industry, news)
3. Potential angles or perspectives to investigate
4. What might be controversial or require cross-verification

Return ONLY a JSON object in this exact format:
{
  "clarifiedQuestion": "A more precise, focused version of the question",
  "keyConcepts": ["concept1", "concept2", "concept3"],
  "steps": [
    {
      "title": "Step title",
      "description": "Detailed description of what this step investigates and why",
      "searchQueries": ["specific query 1", "specific query 2", "specific query 3"],
      "expectedSources": 5,
      "sourceTypes": ["academic", "government", "news", "industry"],
      "priority": "high|medium|low"
    }
  ],
  "potentialPitfalls": ["what might be misleading", "what to double-check"],
  "successCriteria": ["what a good answer should cover"]
}

Question: ${run.question}`;

    const planResponse = await callResearchAi(
      [
        { role: "system", content: `You are an expert research strategist. Create thorough, multi-step research plans. Return valid JSON only.\n\n${getTemporalContext()}` },
        { role: "user", content: planPrompt },
      ],
      signal,
      undefined,
      12000,
    );

    const parsedPlan = safeJsonParse<{
      clarifiedQuestion?: string;
      keyConcepts?: string[];
      steps?: Array<Partial<ResearchPlanStep>>;
      potentialPitfalls?: string[];
      successCriteria?: string[];
    }>(planResponse);

    const planJson = parsedPlan && Array.isArray(parsedPlan.steps) && parsedPlan.steps.length > 0
      ? {
          clarifiedQuestion: parsedPlan.clarifiedQuestion || run.question,
          keyConcepts: parsedPlan.keyConcepts || [],
          steps: parsedPlan.steps,
        }
      : buildFallbackPlan(run.question);

    let planSteps: ResearchPlanStep[] = planJson.steps.map((s, i) => ({
      id: crypto.randomUUID(),
      planId: "plan",
      stepNumber: i + 1,
      title: s.title || `Step ${i + 1}`,
      description: s.description || "",
      searchQueries: s.searchQueries?.length ? s.searchQueries : fallbackSearchQueries(`${run.question} ${s.title ?? ""}`),
      expectedSources: s.expectedSources || 5,
      dependsOnStepIds: s.dependsOnStepIds,
      createdAt: nowIso(),
    }));

    const plan: ResearchPlan = {
      id: crypto.randomUUID(),
      runId: run.id,
      steps: planSteps,
      userApproved: false,
      userEdited: false,
      createdAt: nowIso(),
    };

    await store.updateRun({
      id: run.id,
      plan,
      clarifiedQuestion: planJson.clarifiedQuestion || run.question,
    });

    await completeStep(planStep, `Plan: ${planSteps.length} steps, ${planJson.keyConcepts?.length || 0} key concepts`);
    onEvent({ type: "phase_complete", phase: "plan", stepId: planStep.id });

    // ── Phase 1.5: Wait for Plan Approval ───────────────────────────────────
    if (plan.userApproved === false) {
      await updateRunStatus("paused", 8);
      const waitStep = await createStep("plan", "Waiting for plan approval");
      onEvent({ type: "phase_start", phase: "wait_approval", stepId: waitStep.id });

      // Poll every 2 seconds for plan approval
      let approved = false;
      let waited = 0;
      const maxWait = 30 * 60 * 1000; // 30 minutes max wait
      while (!approved && waited < maxWait) {
        checkAbort();
        await new Promise((resolve) => setTimeout(resolve, 2000));
        waited += 2000;

        // Reload the run to check for approval
        try {
          await store.loadRun(run.id);
          const refreshedRun = store.activeRunOrNull();
          const refreshedPlan = refreshedRun?.run?.plan;
          if (refreshedPlan?.userApproved) {
            planSteps = refreshedPlan.steps;
            approved = true;
          }
        } catch (err) {
          console.warn("[research-runtime] Failed to reload run during approval wait:", err);
        }
      }

      if (!approved) {
        await failStep(waitStep, "Plan approval timed out after 30 minutes");
        await updateRunStatus("failed", 8, { error: "Plan approval timed out" });
        return;
      }

      await completeStep(waitStep, "Plan approved by user");
      onEvent({ type: "phase_complete", phase: "wait_approval", stepId: waitStep.id });
    }
    } // end plan else block

    // ── Phase 2: Multi-Round Search ─────────────────────────────────────────
    checkAbort();
    const searchRoundLimit = Math.min(planSteps.length, config.maxSearchRounds);
    const discoveredUrls = new Set<string>(sources.map((s) => s.url));

    for (let round = 0; round < searchRoundLimit; round++) {
      const planStepItem = planSteps[round];
      const searchStep = await createStep("search", `Search Round ${round + 1}: ${planStepItem.title}`);
      onEvent({ type: "phase_start", phase: "search", stepId: searchStep.id });
      await updateRunStatus("searching", 10 + round * 8);

      const queries = planStepItem.searchQueries || [];
      let roundDiscovered = 0;

      for (const query of queries) {
        checkAbort();
        if (sources.length >= config.maxSources) break;
        searchQueriesUsed.push(query);

        try {
          const bundle = await runSearch(query, signal);
          for (const src of bundle.sources) {
            if (discoveredUrls.has(src.url)) continue;
            if (sources.length >= config.maxSources) break;
            if (roundDiscovered >= config.maxSourcesPerRound) break;
            discoveredUrls.add(src.url);
            roundDiscovered++;
            const sourceInput: CreateResearchSourceInput = {
              runId: run.id,
              stepId: searchStep.id,
              url: src.url,
              title: src.title,
              snippet: src.snippet,
              sourceType: guessSourceType(src.url),
              engine: "searxng",
              score: 0,
              rank: sources.length + 1,
              ...(src.fetch?.status ? { fetchStatus: src.fetch.status } : {}),
            };

            const source = await store.createSource(sourceInput);
            sources.push(source);
            onEvent({ type: "source_fetched", sourceId: source.id, title: source.title });
          }

          onEvent({ type: "search_complete", query, sourceCount: bundle.sources.length });
        } catch (err) {
          console.warn("[research-runtime] Search failed for query:", query, err);
        }
      }

      await completeStep(searchStep, `Discovered ${roundDiscovered} sources (total: ${sources.length})`);
      onEvent({ type: "phase_complete", phase: "search", stepId: searchStep.id });

      // Adaptive deepening: if we have few sources, try broader queries
      if (config.adaptiveDeepening && sources.length < config.maxSources && round === searchRoundLimit - 1) {
        const adaptiveStep = await createStep("search", "Adaptive search: broadening queries");
        const broadQuery = `${run.question} overview comprehensive guide`;
        try {
          const bundle = await runSearch(broadQuery, signal);
          let added = 0;
          for (const src of bundle.sources) {
            if (discoveredUrls.has(src.url)) continue;
            if (sources.length >= config.maxSources) break;
            discoveredUrls.add(src.url);
            added++;

            const source = await store.createSource({
              runId: run.id,
              stepId: adaptiveStep.id,
              url: src.url,
              title: src.title,
              snippet: src.snippet,
              sourceType: guessSourceType(src.url),
              engine: "searxng",
              score: 0,
              rank: sources.length + 1,
              ...(src.fetch?.status ? { fetchStatus: src.fetch.status } : {}),
            });
            sources.push(source);
          }
          await completeStep(adaptiveStep, `Adaptive: ${added} additional sources`);
        } catch (err) {
          await failStep(adaptiveStep, String(err));
        }
      }
    }

    if (sources.length === 0) {
      throw new Error("No sources found during research. Check web search configuration.");
    }

    // ── Phase 3: Fetch & Read ───────────────────────────────────────────────
    checkAbort();
    const readStep = await createStep("read", "Fetching and reading sources");
    onEvent({ type: "phase_start", phase: "read", stepId: readStep.id });
    await updateRunStatus("reading", 35);

    const discoveredSources = sources.filter((s) => s.status === "discovered");

    if (discoveredSources.length > 0) {
      const urls = discoveredSources.map((s) => s.url);

      let pages: FetchedPage[] = [];
      try {
        pages = await invokeFetchAndExtractPages(
          urls,
          RESEARCH_FETCH_CONCURRENCY,
          RESEARCH_FETCH_TIMEOUT_SECS,
          RESEARCH_FETCH_MAX_CHARS,
        );
      } catch (bulkErr) {
        console.warn("[research-runtime] Bulk fetch threw, treating all sources as failed:", bulkErr);
        for (const source of discoveredSources) {
          checkAbort();
          await store.updateSource({
            id: source.id,
            status: "failed" as ResearchSourceStatus,
            error: getErrorMessage(bulkErr),
          });
          const idx = sources.findIndex((s) => s.id === source.id);
          if (idx !== -1) {
            sources[idx] = { ...sources[idx], status: "failed" as ResearchSourceStatus, error: getErrorMessage(bulkErr) };
          }
        }
      }

      const pageByUrl = new Map<string, FetchedPage>();
      for (const page of pages) {
        pageByUrl.set(page.url, page);
      }

      for (const source of discoveredSources) {
        checkAbort();
        const page = pageByUrl.get(source.url);
        if (!page) {
          await store.updateSource({
            id: source.id,
            status: "failed" as ResearchSourceStatus,
            error: "No fetch result returned",
          });
          const idx = sources.findIndex((s) => s.id === source.id);
          if (idx !== -1) {
            sources[idx] = { ...sources[idx], status: "failed" as ResearchSourceStatus, error: "No fetch result returned" };
          }
          continue;
        }

        try {
          const fetched = mapFetchedPageToSource(page);
          const updated = await updateResearchSourceAfterFetch(source.id, fetched);
          const idx = sources.findIndex((s) => s.id === source.id);
          if (idx !== -1) sources[idx] = updated;
          onEvent({ type: "source_fetched", sourceId: updated.id, title: updated.title });
        } catch (updateErr) {
          console.warn("[research-runtime] Update after fetch failed:", source.url, updateErr);
          await store.updateSource({
            id: source.id,
            status: "failed" as ResearchSourceStatus,
            error: getErrorMessage(updateErr),
          });
        }
      }
    }

    // Mark successfully fetched sources as read
    for (const source of sources) {
      checkAbort();
      if (source.status === "fetched") {
        await store.updateSource({
          id: source.id,
          status: "read" as ResearchSourceStatus,
          readAt: nowIso(),
        });
        const idx = sources.findIndex((s) => s.id === source.id);
        if (idx !== -1) {
          sources[idx] = { ...sources[idx], status: "read" as ResearchSourceStatus, readAt: nowIso() };
        }
      }
    }

    const readCount = sources.filter((s) => s.status === "read").length;
    await completeStep(readStep, `Read ${readCount} of ${sources.length} sources`);
    onEvent({ type: "phase_complete", phase: "read", stepId: readStep.id });

    // ── Phase 4: Validate Sources ───────────────────────────────────────────
    if (config.perSourceRead && readCount > 0) {
      checkAbort();
      const validateStep = await createStep("extract", "Validating source quality and relevance");
      onEvent({ type: "phase_start", phase: "validate", stepId: validateStep.id });
      await updateRunStatus("extracting", 40);

      const validSources: ResearchSource[] = [];

      for (const source of sources.filter((s) => s.status === "read")) {
        checkAbort();

        const domainScore = assessDomainAuthority(source.url);
        const textToValidate = source.fullText || source.snippet || "";
        const truncated = truncateToTokens(textToValidate, 12000);

        const validationPrompt = `You are a research quality analyst. Evaluate this source for the research question: "${run.question}"

Source: ${source.title}
URL: ${source.url}
Domain authority score: ${domainScore}/5

Content excerpt:
${truncated}

Evaluate on:
1. RELEVANCE (1-5): How directly does this source address the research question?
2. CREDIBILITY (1-5): Is this from a trustworthy source? Consider domain authority, citations, and author expertise.
3. CURRENCY (1-5): Is the information current and up-to-date?
4. DEPTH (1-5): Does it provide substantive information or just surface-level coverage?

Return ONLY a JSON object:
{
  "relevant": true|false,
  "quality": 1-5,
  "relevanceScore": 1-5,
  "credibilityScore": 1-5,
  "currencyScore": 1-5,
  "depthScore": 1-5,
  "reason": "Brief explanation of the assessment",
  "keyInsights": ["insight 1", "insight 2"]
}`;

        try {
          const validationResponse = await callResearchAi(
            [
              { role: "system", content: `You are a research quality analyst. Evaluate sources rigorously. Return JSON only.\n\n${getTemporalContext()}` },
              { role: "user", content: validationPrompt },
            ],
            signal,
            undefined,
            2000,
          );

          const validation = safeJsonParse<{
            relevant?: boolean;
            quality?: number;
            relevanceScore?: number;
            credibilityScore?: number;
            currencyScore?: number;
            depthScore?: number;
            reason?: string;
            keyInsights?: string[];
          }>(validationResponse);

          const quality = validation?.quality || domainScore;
          const relevant = validation?.relevant !== false && quality >= config.minSourceQuality;

          onEvent({ type: "source_validated", sourceId: source.id, quality, relevant });

          if (relevant) {
            validSources.push(source);
          } else {
            await store.updateSource({
              id: source.id,
              status: "skipped" as ResearchSourceStatus,
            });
            const idx = sources.findIndex((s) => s.id === source.id);
            if (idx !== -1) sources[idx] = { ...sources[idx], status: "skipped" as ResearchSourceStatus };
          }
        } catch (err) {
          console.warn("[research-runtime] Validation failed for source:", source.id, err);
          validSources.push(source); // Include by default if validation fails
        }
      }

      await completeStep(validateStep, `Validated ${validSources.length} of ${readCount} sources as high-quality`);
      onEvent({ type: "phase_complete", phase: "validate", stepId: validateStep.id });
    }

    const activeSources = sources.filter((s) => s.status === "read");

    // ── Phase 5: Per-Source Deep Extraction ─────────────────────────────────
    if (config.perSourceRead && activeSources.length > 0) {
      checkAbort();
      const extractStep = await createStep("extract", "Deep evidence extraction");
      onEvent({ type: "phase_start", phase: "extract", stepId: extractStep.id });
      await updateRunStatus("extracting", 50);

      let skippedEmpty = 0;
      let parseFailed = 0;
      let filteredOut = 0;

      for (const source of activeSources) {
        checkAbort();
        const textToExtract = source.fullText || source.snippet || "";
        if (textToExtract.trim().length < 50) {
          skippedEmpty++;
          console.warn(`[research-runtime] Skipping extraction for source ${source.id}: content too short (${textToExtract.trim().length} chars)`);
          continue;
        }
        const truncated = truncateToTokens(textToExtract, 12000);

        const extractPrompt = `You are a meticulous research analyst. Extract ALL significant evidence from this source for the research question: "${run.question}"

Source: ${source.title}
URL: ${source.url}

Content:
${truncated}

Extract:
1. DIRECT QUOTES with exact wording (use "type": "quote")
2. STATISTICS and numbers (use "type": "statistic")
3. SPECIFIC CLAIMS made by the source (use "type": "claim")
4. VERIFIABLE FACTS (use "type": "fact")
5. EXPERT OPINIONS (use "type": "opinion")
6. STUDIES or research findings (use "type": "study")

For EACH piece of evidence, provide:
- "content": The exact text or a precise summary
- "context": 2-3 sentences of surrounding context
- "confidence": 0.0-1.0 (how certain is this information?)
- "tags": Relevant keywords (3-5 tags)
- "significance": "high", "medium", or "low" - how important is this to the research question?

Return ONLY a bare JSON array. Do NOT wrap it in an object. Example:
[
  {
    "type": "fact",
    "content": "...",
    "context": "...",
    "confidence": 0.85,
    "tags": ["tag1", "tag2"],
    "significance": "high"
  }
]`;

        try {
          const extractResponse = await callResearchAi(
            [
              { role: "system", content: "You are a meticulous research analyst. Extract every piece of significant evidence from sources. Return valid JSON only — a bare array, not wrapped in an object." },
              { role: "user", content: extractPrompt },
            ],
            signal,
            undefined,
            12000,
          );

          const rawParsed = safeJsonParse<unknown>(extractResponse);
          const evidenceArray = normalizeEvidenceArray(rawParsed);

          if (!evidenceArray) {
            parseFailed++;
            const shape = rawParsed === null ? "null" : Array.isArray(rawParsed) ? "array" : typeof rawParsed;
            console.warn(`[research-runtime] Extraction returned non-array shape for source ${source.id}: ${shape}. Raw keys: ${rawParsed && typeof rawParsed === "object" ? Object.keys(rawParsed).join(", ") : "n/a"}`);
            continue;
          }

          let sourceExtracted = 0;
          for (const item of evidenceArray) {
            if (!item.content || String(item.content).trim().length < 10) {
              filteredOut++;
              continue;
            }

            const evidenceInput: CreateResearchEvidenceInput = {
              runId: run.id,
              sourceId: source.id,
              stepId: extractStep.id,
              type: (item.type as ResearchEvidenceType) || "fact",
              content: String(item.content).slice(0, 1000),
              context: String(item.context || "").slice(0, 500),
              confidence: typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : 0.7,
              tags: Array.isArray(item.tags) ? item.tags.slice(0, 5) : [],
            };

            const evidence = await store.createEvidence(evidenceInput);
            evidenceList.push(evidence);
            sourceExtracted++;
            onEvent({ type: "evidence_extracted", evidenceId: evidence.id, evidenceType: evidence.type, content: evidence.content });

            // Create a derived claim for high-significance evidence
            const significance = item.significance || "medium";
            const confidence = evidence.confidence;
            if (significance === "high" || confidence >= 0.75) {
              const claimInput: CreateResearchClaimInput = {
                runId: run.id,
                evidenceId: evidence.id,
                sourceId: evidence.sourceId,
                claim: evidence.content.slice(0, 500),
                confidence: evidence.confidence,
              };

              const claim = await store.createClaim(claimInput);
              claims.push(claim);
            }
          }

          if (sourceExtracted === 0) {
            console.warn(`[research-runtime] Extraction produced 0 valid items for source ${source.id} (${evidenceArray.length} raw items, all filtered)`);
          }
        } catch (err) {
          console.warn("[research-runtime] Extraction failed for source:", source.id, err);
        }
      }

      if (skippedEmpty > 0 || parseFailed > 0 || filteredOut > 0) {
        console.warn(`[research-runtime] Extraction diagnostics: ${skippedEmpty} skipped (empty content), ${parseFailed} parse failures (non-array shape), ${filteredOut} items filtered (short/missing content)`);
      }

      await completeStep(extractStep, `Extracted ${evidenceList.length} evidence items from ${activeSources.length} sources`);
      onEvent({ type: "phase_complete", phase: "extract", stepId: extractStep.id });
    }

    // ── Phase 6: Cross-Source Verification ──────────────────────────────────
    if (config.crossSourceVerify && claims.length > 0) {
      checkAbort();
      const verifyStep = await createStep("verify", "Cross-source verification");
      onEvent({ type: "phase_start", phase: "verify", stepId: verifyStep.id });
      await updateRunStatus("verifying", 65);

      // Group evidence by source for verification
      const evidenceBySource = new Map<string, ResearchEvidence[]>();
      for (const ev of evidenceList) {
        const list = evidenceBySource.get(ev.sourceId) || [];
        list.push(ev);
        evidenceBySource.set(ev.sourceId, list);
      }

      for (const claim of claims) {
        checkAbort();

        // Find evidence related to this claim's topic
        const claimEvidence = evidenceList.filter((e) =>
          e.sourceId === claim.sourceId ||
          e.content.toLowerCase().includes(claim.claim.toLowerCase().slice(0, 30))
        );

        const evidenceText = claimEvidence
          .map((e, i) => `Evidence ${i + 1} from ${sources.find((s) => s.id === e.sourceId)?.title || "Unknown"}:
Type: ${e.type}
Content: ${e.content}
Confidence: ${e.confidence}`)
          .join("\n\n");

        const verifyPrompt = `You are a rigorous fact-checker. Verify this claim by cross-referencing multiple sources.

CLAIM TO VERIFY: "${claim.claim}"

Research Question: ${run.question}

Evidence from sources:
${evidenceText || "No direct evidence found."}

Analyze:
1. Which sources SUPPORT this claim? (list by source name)
2. Which sources CONTRADICT this claim? (list by source name)
3. What is the overall strength of evidence? (strong|moderate|weak|none)
4. Are there any methodological issues or biases?

Return ONLY a JSON object:
{
  "status": "verified|contradicted|unverified|partially_verified",
  "confidence": 0.0-1.0,
  "supportingSources": ["source name 1", "source name 2"],
  "contradictingSources": ["source name 1"],
  "reason": "Detailed explanation of the verification result",
  "strength": "strong|moderate|weak|none",
  "issues": ["methodological issue 1", "bias concern 2"]
}`;

        try {
          const verifyResponse = await callResearchAi(
            [
              { role: "system", content: "You are a rigorous fact-checker. Cross-reference sources carefully. Return valid JSON only." },
              { role: "user", content: verifyPrompt },
            ],
            signal,
            undefined,
            3000,
          );

          const verifyJson = safeJsonParse<{
            status?: string;
            confidence?: number;
            supportingSources?: string[];
            contradictingSources?: string[];
            reason?: string;
            strength?: string;
            issues?: string[];
          }>(verifyResponse);

          const status = (verifyJson?.status as ResearchClaimStatus) || "unverified";
          const confidence = typeof verifyJson?.confidence === "number" ? verifyJson.confidence : claim.confidence;
          const supportingCount = verifyJson?.supportingSources?.length || 0;
          const contradictingCount = verifyJson?.contradictingSources?.length || 0;

          const updatedClaim = await store.updateClaim({
            id: claim.id,
            status,
            confidence: Math.min(1, Math.max(0, confidence)),
            verificationReason: verifyJson?.reason || `Strength: ${verifyJson?.strength || "unknown"}. Issues: ${(verifyJson?.issues || []).join("; ")}`,
          });
          // Update local claims array so contradiction detection uses fresh statuses
          const claimIdx = claims.findIndex((c) => c.id === claim.id);
          if (claimIdx !== -1) claims[claimIdx] = updatedClaim;

          onEvent({ type: "claim_verified", claimId: claim.id, status, supportingSources: supportingCount, contradictingSources: contradictingCount });
        } catch (err) {
          console.warn("[research-runtime] Verification failed for claim:", claim.id, err);
        }
      }

      // Detect contradictions between verified claims
      const verifiedOrPartial = claims.filter((c) => c.status === "verified" || c.status === "partially_verified");
      for (let i = 0; i < verifiedOrPartial.length; i++) {
        for (let j = i + 1; j < verifiedOrPartial.length; j++) {
          const a = verifiedOrPartial[i];
          const b = verifiedOrPartial[j];
          if (!a || !b) continue;

          const contradictionPrompt = `Analyze whether these two claims are in DIRECT CONTRADICTION. Be conservative - only say yes if they are clearly incompatible.

Claim A: "${a.claim}"
Confidence: ${a.confidence}

Claim B: "${b.claim}"
Confidence: ${b.confidence}

Answer ONLY with a JSON object:
{
  "contradict": true|false,
  "reason": "Brief explanation of why they do or do not contradict",
  "resolution": "If they contradict, which claim is more likely correct and why?"
}`;

          try {
            const contradictionResponse = await callResearchAi(
              [
                { role: "system", content: "You are a contradiction analyst. Be conservative. Return valid JSON only." },
                { role: "user", content: contradictionPrompt },
              ],
              signal,
              undefined,
              1500,
            );

            const contradictionJson = safeJsonParse<{ contradict?: boolean; reason?: string; resolution?: string }>(contradictionResponse);

            if (contradictionJson?.contradict === true) {
              const contradictionInput: CreateResearchContradictionInput = {
                runId: run.id,
                claimAId: a.id,
                claimBId: b.id,
                claimAConfidence: a.confidence,
                claimBConfidence: b.confidence,
                reason: contradictionJson.reason || "Detected during cross-source verification",
                resolution: contradictionJson.resolution,
              };

              const contradiction = await store.createContradiction(contradictionInput);
              contradictions.push(contradiction);

              await store.updateClaim({
                id: a.id,
                contradictedBy: [...(a.contradictedBy || []), b.id],
                status: "contradicted",
              });
              await store.updateClaim({
                id: b.id,
                contradictedBy: [...(b.contradictedBy || []), a.id],
                status: "contradicted",
              });

              onEvent({
                type: "contradiction_found",
                contradictionId: contradiction.id,
                claimA: a.claim,
                claimB: b.claim,
              });
            }
          } catch (err) {
            console.warn("[research-runtime] Contradiction check failed:", err);
          }
        }
      }

      await completeStep(verifyStep, `Verified ${claims.length} claims, found ${contradictions.length} contradictions`);
      onEvent({ type: "phase_complete", phase: "verify", stepId: verifyStep.id });
    }

    // ── Phase 7: Gap Analysis & Follow-up Search ──────────────────────────
    if (config.gapAnalysis && claims.length > 0) {
      checkAbort();
      const gapStep = await createStep("search", "Gap analysis and follow-up search");
      onEvent({ type: "phase_start", phase: "gap", stepId: gapStep.id });
      await updateRunStatus("searching", 72);

      const claimsText = claims
        .map((c, i) => `${i + 1}. [${c.status}] ${c.claim} (confidence: ${c.confidence})`)
        .join("\n");

      const sourcesText = activeSources
        .map((s, i) => `${i + 1}. ${s.title} (${s.url})`)
        .join("\n");

      const gapPrompt = `You are a research strategist. Analyze what information is MISSING or INSUFFICIENTLY COVERED.

Research Question: ${run.question}

Current Claims:
${claimsText}

Current Sources:
${sourcesText}

Identify:
1. What important aspects of the question are NOT covered by current claims?
2. What types of sources are missing? (e.g., academic studies, government data, recent news, industry reports)
3. Generate 2-3 specific search queries to fill these gaps.

Return ONLY a JSON object:
{
  "gaps": ["missing aspect 1", "missing aspect 2"],
  "missingSourceTypes": ["academic", "government", "news"],
  "followUpQueries": ["specific query 1", "specific query 2", "specific query 3"]
}`;

      try {
        const gapResponse = await callResearchAi(
          [
            { role: "system", content: `You are a research strategist. Identify information gaps carefully. Return valid JSON only.\n\n${getTemporalContext()}` },
            { role: "user", content: gapPrompt },
          ],
          signal,
          undefined,
          3000,
        );

        const gapJson = safeJsonParse<{
          gaps?: string[];
          missingSourceTypes?: string[];
          followUpQueries?: string[];
        }>(gapResponse);

        const followUpQueries = gapJson?.followUpQueries || [];
        const discoveredUrls = new Set<string>(sources.map((s) => s.url));
        let added = 0;

        for (const query of followUpQueries.slice(0, 3)) {
          checkAbort();
          if (sources.length >= config.maxSources) break;

          try {
            const bundle = await runSearch(query, signal);
            for (const src of bundle.sources) {
              if (discoveredUrls.has(src.url)) continue;
              if (sources.length >= config.maxSources) break;
              discoveredUrls.add(src.url);
              added++;

              const source = await store.createSource({
                runId: run.id,
                stepId: gapStep.id,
                url: src.url,
                title: src.title,
                snippet: src.snippet,
                sourceType: guessSourceType(src.url),
                engine: "searxng",
                score: 0,
                rank: sources.length + 1,
                ...(src.fetch?.status ? { fetchStatus: src.fetch.status } : {}),
              });
              sources.push(source);
            }
          } catch (err) {
            console.warn("[research-runtime] Follow-up search failed:", query, err);
          }
        }

        await completeStep(gapStep, `Gap analysis: ${gapJson?.gaps?.length || 0} gaps, ${added} follow-up sources added`);
      } catch (err) {
        await failStep(gapStep, String(err));
      }

      onEvent({ type: "phase_complete", phase: "gap", stepId: gapStep.id });
    }

    // ── Phase 8: Multi-Pass Synthesis ───────────────────────────────────────
    checkAbort();
    const synthesizeStep = await createStep("synthesize", "Synthesizing comprehensive report");
    onEvent({ type: "phase_start", phase: "synthesize", stepId: synthesizeStep.id });
    await updateRunStatus("synthesizing", 80);

    // Build a comprehensive evidence summary
    const evidenceSummary = evidenceList
      .sort((a, b) => b.confidence - a.confidence)
      .map((e, i) => {
        const source = sources.find((s) => s.id === e.sourceId);
        return `Evidence ${i + 1} [${e.id}]:
Source: ${source?.title || "Unknown"} (${source?.url || "N/A"})
Type: ${e.type}
Confidence: ${e.confidence}
Content: ${e.content}
Context: ${e.context}`;
      })
      .join("\n\n");

    const claimsSummary = claims
      .sort((a, b) => b.confidence - a.confidence)
      .map((c, i) => {
        const ev = evidenceList.find((e) => e.id === c.evidenceId);
        const source = sources.find((s) => s.id === c.sourceId);
        return `Claim ${i + 1} [${c.id}]:
Status: ${c.status}
Confidence: ${c.confidence}
Source: ${source?.title || "Unknown"}
Evidence: ${ev?.content || "N/A"}
Claim: ${c.claim}
Verification: ${c.verificationReason || "Not verified"}`;
      })
      .join("\n\n");

    const contradictionsSummary = contradictions.length > 0
      ? contradictions.map((c, i) => {
          const claimA = claims.find((cl) => cl.id === c.claimAId);
          const claimB = claims.find((cl) => cl.id === c.claimBId);
          return `Contradiction ${i + 1}:
Claim A: ${claimA?.claim || "N/A"} (confidence: ${c.claimAConfidence})
Claim B: ${claimB?.claim || "N/A"} (confidence: ${c.claimBConfidence})
Reason: ${c.reason || "N/A"}
Resolution: ${c.resolution || "Unresolved"}`;
        }).join("\n\n")
      : "No contradictions detected.";

    const sourceQualitySummary = sources
      .filter((s) => s.status === "read")
      .map((s, i) => {
        const authority = assessDomainAuthority(s.url);
        return `[${i + 1}] ${s.title} — ${s.url} (Authority: ${authority}/5)`;
      })
      .join("\n");

    // Pass 1: Build outline
    const outlinePrompt = `You are a senior research analyst. Create a detailed outline for a comprehensive research report.

Research Question: ${run.question}
${run.clarifiedQuestion ? `Clarified Question: ${run.clarifiedQuestion}` : ""}

Key Evidence (sorted by confidence):
${evidenceSummary.slice(0, 8000)}

Claims Summary:
${claimsSummary.slice(0, 4000)}

Contradictions:
${contradictionsSummary}

Create a detailed outline with:
1. Executive Summary
2. Introduction (context and scope)
3. Main sections (3-5 sections based on key themes)
4. For each section: key points to cover, which evidence supports it, which claims to discuss
5. Contradictions section (if any exist)
6. Limitations and Gaps
7. Conclusion

Return ONLY a JSON object:
{
  "title": "Report title",
  "sections": [
    {
      "heading": "Section heading",
      "keyPoints": ["point 1", "point 2"],
      "supportingEvidenceIds": ["evidence-id-1"],
      "supportingClaimIds": ["claim-id-1"],
      "wordCount": 300
    }
  ]
}`;

    let reportMarkdown = "";
    let outlineJson: {
      title?: string;
      sections?: Array<{
        heading?: string;
        keyPoints?: string[];
        supportingEvidenceIds?: string[];
        supportingClaimIds?: string[];
        wordCount?: number;
      }>;
    } | null = null;

    const outlineStep = await createStep("report", "Generating report outline");
    try {
      const outlineResponse = await callResearchAi(
        [
          { role: "system", content: `You are a senior research analyst. Create detailed, well-structured report outlines. Return valid JSON only.\n\n${getTemporalContext()}` },
          { role: "user", content: outlinePrompt },
        ],
        signal,
        undefined,
        12000,
      );

      outlineJson = safeJsonParse(outlineResponse);
      await completeStep(outlineStep, outlineJson?.sections?.length ? `${outlineJson.sections.length} sections planned` : "Using default outline");
    } catch (err) {
      console.warn("[research-runtime] Outline generation failed:", err);
      await failStep(outlineStep, getErrorMessage(err));
    }

    // Pass 2: Write each section
    const rawSections = outlineJson?.sections?.length ? outlineJson.sections : [
      { heading: "Executive Summary", keyPoints: ["Summarize findings"], wordCount: 300 },
      { heading: "Introduction", keyPoints: ["Context and scope"], wordCount: 200 },
      { heading: "Key Findings", keyPoints: ["Main evidence and claims"], wordCount: 600 },
      { heading: "Analysis", keyPoints: ["Interpretation and implications"], wordCount: 400 },
      { heading: "Limitations", keyPoints: ["Gaps and weaknesses"], wordCount: 200 },
      { heading: "Conclusion", keyPoints: ["Summary and recommendations"], wordCount: 200 },
    ];
    const sections = rawSections.slice(0, 8).map((s) => ({
      ...s,
      wordCount: Math.max(150, Math.min(700, s.wordCount || 300)),
    }));

    reportMarkdown += `# ${outlineJson?.title || `Research: ${run.question}`}\n\n`;

    for (let i = 0; i < sections.length; i++) {
      checkAbort();
      const section = sections[i];
      const sectionStep = await createStep("report", `Writing: ${section.heading}`, `Section ${i + 1} of ${sections.length}`);
      onEvent({ type: "report_progress", percent: 80 + Math.floor((i / sections.length) * 15) });

      const sectionEvidence = (section.supportingEvidenceIds || [])
        .map((id) => evidenceList.find((e) => e.id === id))
        .filter(Boolean)
        .map((e) => {
          const source = sources.find((s) => s.id === e!.sourceId);
          return `Evidence: ${e!.content} (Source: ${source?.title || "Unknown"}, Confidence: ${e!.confidence})`;
        })
        .join("\n");

      const sectionClaims = (section.supportingClaimIds || [])
        .map((id) => claims.find((c) => c.id === id))
        .filter(Boolean)
        .map((c) => `Claim: ${c!.claim} (Status: ${c!.status}, Confidence: ${c!.confidence})`)
        .join("\n");

      const sectionPrompt = `Write section "${section.heading}" for a research report.

Research Question: ${run.question}

Key Points to Cover:
${(section.keyPoints || []).map((p) => `- ${p}`).join("\n")}

${sectionEvidence ? `Supporting Evidence:\n${sectionEvidence}\n\n` : ""}
${sectionClaims ? `Related Claims:\n${sectionClaims}\n\n` : ""}

${i === sections.length - 2 && contradictions.length > 0 ? `Contradictions to Address:\n${contradictionsSummary}\n\n` : ""}

Requirements:
- Write in formal, objective academic tone
- Cite sources using [1], [2], etc. (matching the source numbers below)
- Address uncertainties and conflicting evidence honestly
- Include specific statistics and quotes where available
- Target: ${section.wordCount || 300} words

Sources:
${sourceQualitySummary}

Write ONLY the section content in markdown. Do NOT include the heading (it will be added separately).`;

      try {
        const sectionResponse = await callResearchAi(
          [
            { role: "system", content: `You are an expert research writer. Write formal, well-cited, objective research sections. Use markdown formatting.\n\n${getTemporalContext()}` },
            { role: "user", content: sectionPrompt },
          ],
          signal,
          undefined,
          Math.max(1000, (section.wordCount || 300) * 2),
        );

        const wordCount = sectionResponse.split(/\s+/).filter(Boolean).length;
        reportMarkdown += sectionResponse;
        reportMarkdown += "\n\n";
        await completeStep(sectionStep, `${wordCount} words written`);
      } catch (err) {
        console.warn("[research-runtime] Section writing failed:", section.heading, err);
        reportMarkdown += `\n\n*[Section generation failed for "${section.heading}"]*\n\n`;
        await failStep(sectionStep, getErrorMessage(err));
      }
    }

    // Extract body citations BEFORE adding Sources appendix
    const citationRegex = /\[(\d+)\]/g;
    const bodyCitedNumbers = new Set<number>();
    let match;
    while ((match = citationRegex.exec(reportMarkdown)) !== null) {
      bodyCitedNumbers.add(parseInt(match[1], 10));
    }

    // Build citation map from read sources
    const readSources = sources.filter((s) => s.status === "read");
    const citationMap: Record<string, string> = {};
    readSources.forEach((s, i) => {
      citationMap[String(i + 1)] = s.id;
    });

    // Add source list appendix
    reportMarkdown += `---\n\n## Sources\n\n`;
    readSources.forEach((s, i) => {
      reportMarkdown += `[${i + 1}] ${s.title}. Retrieved from: ${s.url}\n\n`;
    });

    // Recalculate word count before persisting
    const finalWordCount = reportMarkdown.split(/\s+/).filter(Boolean).length;

    console.debug("[research-runtime] Creating report:", {
      wordCount: finalWordCount,
      sourceCount: readSources.length,
      evidenceCount: evidenceList.length,
      bodyCitations: bodyCitedNumbers.size,
      markdownLength: reportMarkdown.length,
    });

    const reportInput: CreateResearchReportInput = {
      runId: run.id,
      title: outlineJson?.title || `Research: ${run.question}`,
      contentMarkdown: reportMarkdown,
      citationMap,
      sourceIds: readSources.map((s) => s.id),
      evidenceIds: evidenceList.map((e) => e.id),
      wordCount: finalWordCount,
      format: "markdown",
    };

    const report = await store.createReport(reportInput);

    // Complete synthesize step NOW, before audit
    await completeStep(synthesizeStep, `Report: ${finalWordCount} words, ${sections.length} sections, ${evidenceList.length} evidence items cited`);
    onEvent({ type: "phase_complete", phase: "synthesize", stepId: synthesizeStep.id });

    // ── Phase 8.5: Citation Audit ───────────────────────────────────────────
    // Cap audit to 20 unique body citations to bound work
    const MAX_AUDIT_CITATIONS = 20;
    const citationsToAudit = [...bodyCitedNumbers].slice(0, MAX_AUDIT_CITATIONS);
    const skippedAudit = bodyCitedNumbers.size - citationsToAudit.length;

    checkAbort();
    const auditStep = await createStep("verify", "Auditing citations for accuracy");
    onEvent({ type: "phase_start", phase: "audit", stepId: auditStep.id });
    await updateRunStatus("verifying", 85);

    const auditResults: Array<{
      citationNumber: number;
      sourceId: string;
      sourceTitle: string;
      claimFound: boolean;
      supportingEvidence: string[];
      auditNotes: string;
    }> = [];

    for (let idx = 0; idx < citationsToAudit.length; idx++) {
      const num = citationsToAudit[idx];
      checkAbort();

      // Emit progress so UI can show bounded work
      onEvent({ type: "report_progress", percent: 85 + Math.floor((idx / citationsToAudit.length) * 10) });

      const sourceIndex = num - 1;
      const source = readSources[sourceIndex];
      if (!source) {
        auditResults.push({
          citationNumber: num,
          sourceId: "missing",
          sourceTitle: "Source not found",
          claimFound: false,
          supportingEvidence: [],
          auditNotes: "Citation number out of range - no matching source",
        });
        continue;
      }

      const citationContext = extractCitationContext(reportMarkdown, num);
      const sourceEvidence = evidenceList.filter((e) => e.sourceId === source.id);
      const evidenceText = sourceEvidence
        .map((e) => e.content)
        .join("\n")
        .slice(0, 3000);

      const auditPrompt = `You are a citation auditor. Verify that a cited source actually supports the claims made near its citation.

Citation [${num}] — ${source.title}
URL: ${source.url}

Claims in context near this citation:
${citationContext}

Evidence from this source:
${evidenceText || "No direct evidence extracted"}

Audit: Does this source actually support the claims cited? Answer ONLY with a JSON object:
{
  "claimFound": true|false,
  "supportingEvidence": ["exact evidence that supports the claim"],
  "auditNotes": "Brief explanation of whether the citation is accurate, exaggerated, or unsupported"
}`;

      try {
        const auditResponse = await callResearchAi(
          [
            { role: "system", content: "You are a citation auditor. Verify citations rigorously. Return valid JSON only." },
            { role: "user", content: auditPrompt },
          ],
          signal,
          undefined,
          2000,
        );

        const auditJson = safeJsonParse<{
          claimFound?: boolean;
          supportingEvidence?: string[];
          auditNotes?: string;
        }>(auditResponse);

        auditResults.push({
          citationNumber: num,
          sourceId: source.id,
          sourceTitle: source.title,
          claimFound: auditJson?.claimFound ?? true,
          supportingEvidence: auditJson?.supportingEvidence || [],
          auditNotes: auditJson?.auditNotes || "Audit inconclusive",
        });
      } catch (err) {
        auditResults.push({
          citationNumber: num,
          sourceId: source.id,
          sourceTitle: source.title,
          claimFound: true,
          supportingEvidence: [],
          auditNotes: "Audit failed: " + getErrorMessage(err),
        });
      }
    }

    // Mark unsupported citations in the report
    const unsupportedCitations = auditResults.filter((a) => !a.claimFound);
    if (unsupportedCitations.length > 0) {
      const auditNotes = unsupportedCitations
        .map((a) => `- [${a.citationNumber}] ${a.sourceTitle}: ${a.auditNotes}`)
        .join("\n");

      reportMarkdown += `\n\n---\n\n## Citation Audit\n\nThe following citations were flagged as potentially unsupported:\n\n${auditNotes}\n\n`;
    }

    const auditDetail = `Audited ${auditResults.length} citations, ${unsupportedCitations.length} flagged` +
      (skippedAudit > 0 ? ` (${skippedAudit} citations skipped due to cap)` : "");
    await completeStep(auditStep, auditDetail);
    onEvent({ type: "phase_complete", phase: "audit", stepId: auditStep.id });

    // Update report if audit appended content
    if (unsupportedCitations.length > 0) {
      const updatedWordCount = reportMarkdown.split(/\s+/).filter(Boolean).length;
      await store.updateReport({ id: report.id, contentMarkdown: reportMarkdown, wordCount: updatedWordCount });
    }

    onEvent({ type: "report_complete", reportId: report.id });

    // ── Phase 9: Finalize ───────────────────────────────────────────────────
    await updateRunStatus("completed", 100, {
      completedAt: nowIso(),
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const isPaused = store.isPausing;
    const status = isPaused ? "paused" : "failed";

    if (isPaused) {
      console.info("[research-runtime] Research run paused:", message);
    } else {
      console.error("[research-runtime] Research run failed:", message, error);
    }

    onEvent({ type: "error", error: message });

    await store.updateRun({
      id: run.id,
      status,
      error: isPaused ? undefined : message,
      completedAt: isPaused ? undefined : nowIso(),
    });

    store.setActiveController(null);
    // Reset isPausing after handling
    if (isPaused) {
      useResearchStore.setState({ isPausing: false });
    }
  }
}

export function resumeResearchRun(
  run: ResearchRun,
  signal: AbortSignal,
  onEvent: (event: ResearchRuntimeEvent) => void,
): Promise<void> {
  const store = useResearchStore.getState();
  const steps = store.activeRun?.steps ?? [];

  const hasCompleted = (type: string) =>
    steps.some((s) => s.type === type && s.status === "completed");

  let resumePhase: ResumePhase;
  if (hasCompleted("synthesize")) {
    resumePhase = "synthesize";
  } else if (hasCompleted("verify")) {
    resumePhase = "synthesize";
  } else if (hasCompleted("extract")) {
    resumePhase = "verify";
  } else if (hasCompleted("read")) {
    resumePhase = "extract";
  } else if (hasCompleted("search")) {
    resumePhase = "read";
  } else if (hasCompleted("plan")) {
    resumePhase = "search";
  } else {
    resumePhase = "plan";
  }

  console.info(`[research-runtime] Resuming from phase: ${resumePhase}`);
  return executeResearchRun(run, signal, onEvent, resumePhase);
}
