import type { ResearchPlanStep, ResearchPlan } from "./research-types";
import type { ResearchRuntimeContext } from "./research-runtime-context";
import { callResearchAi, getTemporalContext } from "./research-ai";
import { safeJsonParse } from "./research-json-utils";
import { nowIso, fallbackSearchQueries, buildFallbackPlan } from "./research-source-utils";
import { RESEARCH_OUTPUT_TOKENS } from "./research-output-budgets";

export type PhaseResult = { continue: true } | { continue: false; reason: "paused" | "failed" | "completed" };

export async function planPhase(
  ctx: ResearchRuntimeContext,
  resumeFromPhase?: string,
): Promise<PhaseResult & { planSteps: ResearchPlanStep[] }> {
  const { run, config, signal, store, onEvent } = ctx;

  ctx.checkAbort();
  const planStep = await ctx.createStep("plan", "Planning research strategy");
  onEvent({ type: "phase_start", phase: "plan", stepId: planStep.id });
  await ctx.updateRunStatus("planning", 5);

  const planSteps: ResearchPlanStep[] = [];

  // If resuming with an existing approved plan, reuse it
  if (resumeFromPhase && run.plan?.userApproved) {
    planSteps.push(...run.plan.steps);
    await ctx.completeStep(planStep, `Resumed with existing plan: ${planSteps.length} steps`);
    onEvent({ type: "phase_complete", phase: "plan", stepId: planStep.id });
  } else {

  const backgroundSection = ctx.backgroundContext
    ? `\n\nBackground context gathered from initial web searches:\n${ctx.backgroundContext}\n\nUse this context to create a more informed plan with better search queries.`
    : "";

  const planPrompt = `You are an expert research strategist. Your task is to create a research plan for the following question. Create no more than ${config.maxSearchRounds} search steps.

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

Question: ${run.question}${backgroundSection}`;

  const planResult = await callResearchAi(
    [
      { role: "system", content: `You are an expert research strategist. Create thorough, multi-step research plans. Return valid JSON only.\n\n${getTemporalContext()}` },
      { role: "user", content: planPrompt },
    ],
    signal,
    undefined,
    RESEARCH_OUTPUT_TOKENS.plan,
    { reasoningEnabled: config.synthesisReasoning, jsonModeHint: true, temperature: 0.6, ...ctx.researchAiOptions("main") },
  );
  if (planResult.tokens?.totalTokens) ctx.tokenUsage.input += planResult.tokens.totalTokens;
  const planResponse = planResult.text;

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

  const planId = crypto.randomUUID();
  const newSteps: ResearchPlanStep[] = planJson.steps.map((s, i) => ({
    id: crypto.randomUUID(),
    planId,
    stepNumber: i + 1,
    title: s.title || `Step ${i + 1}`,
    description: s.description || "",
    searchQueries: s.searchQueries?.length ? s.searchQueries : fallbackSearchQueries(`${run.question} ${s.title ?? ""}`),
    expectedSources: typeof s.expectedSources === "number" ? s.expectedSources : (Number(s.expectedSources) || 5),
    dependsOnStepIds: Array.isArray(s.dependsOnStepIds) ? s.dependsOnStepIds : undefined,
    createdAt: nowIso(),
  }));

  planSteps.push(...newSteps);

  const plan: ResearchPlan = {
    id: planId,
    runId: run.id,
    steps: newSteps,
    userApproved: true,
    userEdited: false,
    createdAt: nowIso(),
  };

  await store.updateRun({
    id: run.id,
    plan,
    clarifiedQuestion: planJson.clarifiedQuestion || run.question,
  });
  ctx.activeResearchPlan = plan;
  ctx.clarifiedResearchQuestion = planJson.clarifiedQuestion || run.question;

  await ctx.completeStep(planStep, `Plan: ${planSteps.length} steps, ${planJson.keyConcepts?.length || 0} key concepts`);
  onEvent({ type: "phase_complete", phase: "plan", stepId: planStep.id });
  } // end plan else block

  // Build plan context for downstream phases (validation, extraction, synthesis).
  if (ctx.activeResearchPlan?.steps?.length) {
    const concepts = planSteps
      .flatMap((s) => s.searchQueries ?? [])
      .slice(0, 10);
    ctx.planContextSummary = [
      `Research strategy: ${ctx.activeResearchPlan.steps.length} planned steps.`,
      ctx.clarifiedResearchQuestion ? `Clarified question: ${ctx.clarifiedResearchQuestion}` : "",
      concepts.length > 0 ? `Key search angles: ${concepts.join("; ")}` : "",
    ].filter(Boolean).join("\n");
  }

  return { continue: true, planSteps };
}
