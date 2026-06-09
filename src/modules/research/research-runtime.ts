import type { ChatMessage } from "@/lib/chat-types";
import { getProviderAdapter } from "@/lib/providers";
import { runSearch } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { estimateTokens } from "@/lib/context";
import { useResearchStore } from "./research-store";
import { fetchResearchSource, fetchResearchSourcesBulk, updateResearchSourceAfterFetch } from "./research-storage";
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

export type ResearchRuntimeEvent =
  | { type: "phase_start"; phase: string; stepId: string }
  | { type: "phase_complete"; phase: string; stepId: string }
  | { type: "phase_error"; phase: string; stepId: string; error: string }
  | { type: "search_complete"; query: string; sourceCount: number }
  | { type: "source_fetched"; sourceId: string; title: string }
  | { type: "evidence_extracted"; evidenceId: string; evidenceType: string; content: string }
  | { type: "claim_verified"; claimId: string; status: string }
  | { type: "contradiction_found"; contradictionId: string; claimA: string; claimB: string }
  | { type: "report_progress"; percent: number }
  | { type: "report_complete"; reportId: string }
  | { type: "error"; error: string };

// ── Depth configuration ────────────────────────────────────────────────────

type DepthConfig = {
  maxSearchRounds: number;
  maxSources: number;
  verify: boolean;
  followUp: boolean;
};

function getDepthConfig(depth: ResearchDepth): DepthConfig {
  switch (depth) {
    case "quick":
      return { maxSearchRounds: 1, maxSources: 5, verify: false, followUp: false };
    case "standard":
      return { maxSearchRounds: 2, maxSources: 10, verify: true, followUp: false };
    case "deep":
      return { maxSearchRounds: 3, maxSources: 20, verify: true, followUp: false };
    case "exhaustive":
      return { maxSearchRounds: 4, maxSources: 30, verify: true, followUp: true };
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
  try {
    const cleaned = text.replace(/^[\s\S]*?```json\s*([\s\S]*?)\s*```[\s\S]*$/m, "$1").trim();
    const json = cleaned.startsWith("{") || cleaned.startsWith("[") ? cleaned : text;
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function guessSourceType(url: string): ResearchSourceType {
  const lower = url.toLowerCase();
  if (lower.includes("wikipedia.org")) return "wikipedia";
  if (lower.includes("github.com")) return "github";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.includes("news") || lower.includes("bbc.com") || lower.includes("reuters.com")) return "news";
  if (lower.includes("docs.") || lower.includes("documentation")) return "docs";
  if (lower.includes("forum") || lower.includes("reddit.com") || lower.includes("stackoverflow.com")) return "forum";
  return "webpage";
}

function nowIso(): string {
  return new Date().toISOString();
}

function truncateToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const maxChars = maxTokens * 4; // rough chars-per-token heuristic
  return text.slice(0, maxChars);
}

// ── AI helper ────────────────────────────────────────────────────────────────

async function callResearchAi(
  messages: Array<{ role: "system" | "user"; content: string }>,
  signal: AbortSignal,
  onChunk?: (chunk: string) => void,
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
        temperature: 0.3,
        contextLength: modelSettings.contextLength || undefined,
        maxTokens: modelSettings.maxTokens || undefined,
        topP: modelSettings.topP || undefined,
        repetitionPenalty: modelSettings.repetitionPenalty || undefined,
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

export async function executeResearchRun(
  run: ResearchRun,
  signal: AbortSignal,
  onEvent: (event: ResearchRuntimeEvent) => void,
): Promise<void> {
  const store = useResearchStore.getState();
  const config = getDepthConfig(run.depth);

  const sources: ResearchSource[] = [];
  const evidenceList: ResearchEvidence[] = [];
  const claims: ResearchClaim[] = [];
  const contradictions: ResearchContradiction[] = [];

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

  try {
    // ── Phase 1: Plan ───────────────────────────────────────────────────────
    checkAbort();
    const planStep = await createStep("plan", "Planning research");
    onEvent({ type: "phase_start", phase: "plan", stepId: planStep.id });
    await updateRunStatus("planning", 5);

    const planPrompt = `You are a research planner. Break this question into a structured research plan with 3-5 steps. Each step should have search queries.

Return ONLY a JSON object in this exact format:
{
  "steps": [
    {
      "title": "Step title",
      "description": "What this step investigates",
      "searchQueries": ["query 1", "query 2"],
      "expectedSources": 5
    }
  ]
}

Question: ${run.question}`;

    const planResponse = await callResearchAi(
      [
        { role: "system", content: "You are a research planner. Break questions into structured research plans. Return JSON only." },
        { role: "user", content: planPrompt },
      ],
      signal,
    );

    const planJson = safeJsonParse<{ steps: Array<Partial<ResearchPlanStep>> }>(planResponse);
    if (!planJson || !Array.isArray(planJson.steps)) {
      throw new Error("Failed to parse research plan from AI response");
    }

    const planSteps: ResearchPlanStep[] = planJson.steps.map((s, i) => ({
      id: crypto.randomUUID(),
      planId: "plan",
      stepNumber: i + 1,
      title: s.title || `Step ${i + 1}`,
      description: s.description || "",
      searchQueries: s.searchQueries || [],
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
    });

    await completeStep(planStep);
    onEvent({ type: "phase_complete", phase: "plan", stepId: planStep.id });

    // ── Phase 2: Search ─────────────────────────────────────────────────────
    checkAbort();
    const searchRoundLimit = Math.min(planSteps.length, config.maxSearchRounds);

    for (let round = 0; round < searchRoundLimit; round++) {
      const planStepItem = planSteps[round];
      const searchStep = await createStep("search", `Search: ${planStepItem.title}`);
      onEvent({ type: "phase_start", phase: "search", stepId: searchStep.id });
      await updateRunStatus("searching", 10 + round * 10);

      const queries = planStepItem.searchQueries || [];
      const discoveredUrls = new Set<string>();

      for (const query of queries) {
        checkAbort();
        if (sources.length >= config.maxSources) break;

        try {
          const bundle = await runSearch(query, signal);
          for (const src of bundle.sources) {
            if (discoveredUrls.has(src.url)) continue;
            if (sources.length >= config.maxSources) break;
            discoveredUrls.add(src.url);

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

      await completeStep(searchStep, `Discovered ${discoveredUrls.size} sources`);
      onEvent({ type: "phase_complete", phase: "search", stepId: searchStep.id });
    }

    if (sources.length === 0) {
      throw new Error("No sources found during research. Check web search configuration.");
    }

    // ── Phase 3: Read ───────────────────────────────────────────────────────
    checkAbort();
    const readStep = await createStep("read", "Reading sources");
    onEvent({ type: "phase_start", phase: "read", stepId: readStep.id });
    await updateRunStatus("reading", 40);

    const discoveredSources = sources.filter((s) => s.status === "discovered");

    if (discoveredSources.length > 0) {
      // Try bulk fetch first for performance
      try {
        const urls = discoveredSources.map((s) => s.url);
        const results = await fetchResearchSourcesBulk(urls);
        for (let i = 0; i < results.length; i++) {
          checkAbort();
          const result = results[i];
          const source = discoveredSources[i];
          if (!source) continue;

          if (result?.source) {
            const updated = await updateResearchSourceAfterFetch(source.id, result.source);
            const idx = sources.findIndex((s) => s.id === source.id);
            if (idx !== -1) sources[idx] = updated;
            onEvent({ type: "source_fetched", sourceId: updated.id, title: updated.title });
          } else {
            await store.updateSource({
              id: source.id,
              status: "failed" as ResearchSourceStatus,
              error: result?.error || "Fetch failed",
            });
            const idx = sources.findIndex((s) => s.id === source.id);
            if (idx !== -1) {
              sources[idx] = { ...sources[idx], status: "failed" as ResearchSourceStatus, error: result?.error || "Fetch failed" };
            }
          }
        }
      } catch (bulkErr) {
        console.warn("[research-runtime] Bulk fetch failed, falling back to individual fetches:", bulkErr);
        for (const source of discoveredSources) {
          checkAbort();
          try {
            const fetched = await fetchResearchSource(source.url);
            const updated = await updateResearchSourceAfterFetch(source.id, fetched);
            const idx = sources.findIndex((s) => s.id === source.id);
            if (idx !== -1) sources[idx] = updated;
            onEvent({ type: "source_fetched", sourceId: updated.id, title: updated.title });
          } catch (fetchErr) {
            console.warn("[research-runtime] Fetch failed for source:", source.url, fetchErr);
            await store.updateSource({
              id: source.id,
              status: "failed" as ResearchSourceStatus,
              error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
            });
            const idx = sources.findIndex((s) => s.id === source.id);
            if (idx !== -1) {
              sources[idx] = { ...sources[idx], status: "failed" as ResearchSourceStatus, error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) };
            }
          }
        }
      }
    }

    // Mark fetched sources as read
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
    await completeStep(readStep, `Read ${readCount} sources`);
    onEvent({ type: "phase_complete", phase: "read", stepId: readStep.id });

    // ── Phase 4: Extract ────────────────────────────────────────────────────
    checkAbort();
    const extractStep = await createStep("extract", "Extracting evidence");
    onEvent({ type: "phase_start", phase: "extract", stepId: extractStep.id });
    await updateRunStatus("extracting", 50);

    const sourcesText = sources
      .map((s, i) => {
        const text = s.fullText && s.fullText.length > 0
          ? truncateToTokens(s.fullText, 8000)
          : s.snippet || "";
        return `Source ${i + 1} [${s.id}]: ${s.title}\nURL: ${s.url}\nContent: ${text}`;
      })
      .join("\n\n");

    const extractPrompt = `You are a research analyst. Extract key claims, statistics, quotes, and facts from the provided sources.

Return ONLY a JSON array in this exact format:
[
  {
    "type": "claim|statistic|quote|fact|opinion|study",
    "content": "The extracted content",
    "context": "Surrounding context or source reference",
    "confidence": 0.85,
    "tags": ["tag1", "tag2"]
  }
]

Sources:
${sourcesText}`;

    const extractResponse = await callResearchAi(
      [
        { role: "system", content: "You are a research analyst. Extract structured evidence from sources. Return JSON only." },
        { role: "user", content: extractPrompt },
      ],
      signal,
    );

    const evidenceJson = safeJsonParse<Array<Partial<ResearchEvidence>>>(extractResponse);
    if (evidenceJson && Array.isArray(evidenceJson)) {
      for (const item of evidenceJson) {
        const sourceIndex = Math.min(evidenceList.length, sources.length - 1);
        const sourceId = sources[sourceIndex]?.id || sources[0]?.id || "";

        const evidenceInput: CreateResearchEvidenceInput = {
          runId: run.id,
          sourceId,
          stepId: extractStep.id,
          type: (item.type as ResearchEvidenceType) || "fact",
          content: item.content || "",
          context: item.context || "",
          confidence: typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : 0.7,
          tags: Array.isArray(item.tags) ? item.tags : [],
        };

        const evidence = await store.createEvidence(evidenceInput);
        evidenceList.push(evidence);
        onEvent({ type: "evidence_extracted", evidenceId: evidence.id, evidenceType: evidence.type, content: evidence.content });

        // Derive a claim from each evidence item
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

    await completeStep(extractStep, `Extracted ${evidenceList.length} evidence items`);
    onEvent({ type: "phase_complete", phase: "extract", stepId: extractStep.id });

    // ── Phase 5: Verify ───────────────────────────────────────────────────
    if (config.verify && claims.length > 0) {
      checkAbort();
      const verifyStep = await createStep("verify", "Verifying claims");
      onEvent({ type: "phase_start", phase: "verify", stepId: verifyStep.id });
      await updateRunStatus("verifying", 65);

      const evidenceText = evidenceList
        .map((e, i) => `Evidence ${i + 1} [${e.id}]: ${e.content} (${e.type}, confidence: ${e.confidence})`)
        .join("\n\n");

      for (const claim of claims) {
        checkAbort();

        const verifyPrompt = `You are a fact-checker. Verify this claim against the provided evidence.

Claim: ${claim.claim}

Evidence:
${evidenceText}

Return ONLY a JSON object in this exact format:
{
  "status": "verified|contradicted|unverified",
  "reason": "Brief explanation",
  "confidence": 0.9
}`;

        try {
          const verifyResponse = await callResearchAi(
            [
              { role: "system", content: "You are a fact-checker. Verify claims against evidence. Return JSON only." },
              { role: "user", content: verifyPrompt },
            ],
            signal,
          );

          const verifyJson = safeJsonParse<{ status?: string; reason?: string; confidence?: number }>(verifyResponse);
          const status = (verifyJson?.status as ResearchClaimStatus) || "unverified";
          const reason = verifyJson?.reason || "";
          const confidence = typeof verifyJson?.confidence === "number" ? verifyJson.confidence : claim.confidence;

          await store.updateClaim({
            id: claim.id,
            status,
            confidence: Math.min(1, Math.max(0, confidence)),
            verificationReason: reason,
          });

          onEvent({ type: "claim_verified", claimId: claim.id, status });
        } catch (err) {
          console.warn("[research-runtime] Verification failed for claim:", claim.id, err);
        }
      }

      // Detect contradictions among verified claims
      const verifiedClaims = claims.filter((c) => c.status === "verified");
      for (let i = 0; i < verifiedClaims.length; i++) {
        for (let j = i + 1; j < verifiedClaims.length; j++) {
          const a = verifiedClaims[i];
          const b = verifiedClaims[j];
          if (!a || !b) continue;

          // Simple heuristic: ask AI if these two claims contradict
          const contradictionPrompt = `Do these two claims contradict each other? Answer ONLY "yes" or "no".

Claim A: ${a.claim}
Claim B: ${b.claim}`;

          try {
            const contradictionResponse = await callResearchAi(
              [
                { role: "system", content: "You are a contradiction detector. Answer only yes or no." },
                { role: "user", content: contradictionPrompt },
              ],
              signal,
            );

            if (contradictionResponse.toLowerCase().includes("yes")) {
              const contradictionInput: CreateResearchContradictionInput = {
                runId: run.id,
                claimAId: a.id,
                claimBId: b.id,
                claimAConfidence: a.confidence,
                claimBConfidence: b.confidence,
                reason: "Detected during automated verification",
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

      await completeStep(verifyStep, `Verified ${claims.length} claims`);
      onEvent({ type: "phase_complete", phase: "verify", stepId: verifyStep.id });
    }

    // ── Phase 6: Synthesize ─────────────────────────────────────────────────
    checkAbort();
    const synthesizeStep = await createStep("synthesize", "Writing report");
    onEvent({ type: "phase_start", phase: "synthesize", stepId: synthesizeStep.id });
    await updateRunStatus("synthesizing", 80);

    const verifiedClaimsText = claims
      .map((c, i) => `Claim ${i + 1} [${c.id}]: ${c.claim} (${c.status}, confidence: ${c.confidence})`)
      .join("\n\n");

    const contradictionsText = contradictions.length > 0
      ? contradictions
          .map((c, i) => `Contradiction ${i + 1}: ${c.claimAId} vs ${c.claimBId}`)
          .join("\n\n")
      : "No contradictions detected.";

    const synthesizePrompt = `You are a research writer. Write a comprehensive research report with citations.

Use the verified claims and evidence below. Include a "Contradictions" section if any exist.

Use markdown format. Cite sources using [1], [2], etc. references.

Verified Claims:
${verifiedClaimsText}

${contradictionsText}

Sources:
${sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join("\n")}

Question: ${run.question}`;

    let reportMarkdown = "";

    await callResearchAi(
      [
        { role: "system", content: "You are a research writer. Write comprehensive, well-cited research reports in markdown." },
        { role: "user", content: synthesizePrompt },
      ],
      signal,
      (chunk) => {
        reportMarkdown += chunk;
        onEvent({ type: "report_progress", percent: 80 + Math.min(15, Math.floor(reportMarkdown.length / 500)) });
      },
    );

    // Build citation map from simple [N] references
    const citationMap: Record<string, string> = {};
    sources.forEach((s, i) => {
      citationMap[String(i + 1)] = s.id;
    });

    const wordCount = reportMarkdown.split(/\s+/).filter(Boolean).length;

    const reportInput: CreateResearchReportInput = {
      runId: run.id,
      title: `Research: ${run.question}`,
      contentMarkdown: reportMarkdown,
      citationMap,
      sourceIds: sources.map((s) => s.id),
      evidenceIds: evidenceList.map((e) => e.id),
      wordCount,
      format: "markdown",
    };

    const report = await store.createReport(reportInput);

    await completeStep(synthesizeStep, `Report: ${wordCount} words`);
    onEvent({ type: "phase_complete", phase: "synthesize", stepId: synthesizeStep.id });
    onEvent({ type: "report_complete", reportId: report.id });

    // ── Phase 7: Finalize ───────────────────────────────────────────────────
    await updateRunStatus("completed", 100, {
      completedAt: nowIso(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[research-runtime] Research run failed:", message);

    onEvent({ type: "error", error: message });

    await store.updateRun({
      id: run.id,
      status: "failed",
      error: message,
      completedAt: nowIso(),
    });
  }
}
