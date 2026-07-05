import type { ResearchSource, ResearchClaim, ResearchClaimStatus, ResearchSourceStatus, CreateResearchContradictionInput } from "./research-types";
import type { ResearchRuntimeContext } from "./research-runtime-context";
import { callResearchAi, getTemporalContext } from "./research-ai";
import { safeJsonParse, normalizeBatchVerifyArray, normalizeClaimStatus } from "./research-json-utils";
import { pickContradictionWinner } from "./research-citation-utils";
import { buildSingleSourceValidationPrompt, buildBatchSourceValidationPrompt, buildClaimVerificationPrompt, buildContradictionCheckPrompt, VALIDATION_SYSTEM_PROMPT, BATCH_VALIDATION_SYSTEM_PROMPT, VERIFICATION_SYSTEM_PROMPT, CONTRADICTION_SYSTEM_PROMPT } from "./research-validation-prompts";
import { buildVerifyBatches } from "./research-claim-evidence-builder";
import { generateContradictionPairs, rankContradictionPairs, filterAndCapPairs } from "./research-contradiction-pairing";
import { computeSourceQuality, isSourceValid } from "./research-source-quality";

// ── Source validation ──────────────────────────────────────────────────────

async function validateSource(ctx: ResearchRuntimeContext, source: ResearchSource): Promise<ResearchSource> {
  const { run, config, signal, store, onEvent } = ctx;

  const validationPrompt = buildSingleSourceValidationPrompt(
    source,
    ctx.clarifiedResearchQuestion || run.question,
    ctx.planContextSummary,
    (s) => ctx.getSourceChunks(s),
  );

  try {
    const { value: validationResponse } = await ctx.runAiStep(
      "extract",
      `Validate: ${source.title.length > 80 ? `${source.title.slice(0, 77)}…` : source.title}`,
      "Quality assessment",
      () =>
        callResearchAi(
          [
            { role: "system", content: `${VALIDATION_SYSTEM_PROMPT}\n\n${getTemporalContext()}` },
            { role: "user", content: validationPrompt },
          ],
          signal,
          undefined,
          2000,
          ctx.researchAiOptions("lite", { reasoningEnabled: config.validateReasoning }),
        ),
      (v) => `${v.length} chars evaluated`,
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

    const { relevant, quality, sourceQuality } = computeSourceQuality(
      validation ?? {},
      source.url,
      config.minSourceQuality,
    );

    const updatedSource = await store.updateSource({
      id: source.id,
      sourceQuality,
    });

    onEvent({ type: "source_validated", sourceId: source.id, quality, relevant });

    if (!relevant) {
      const skippedSource = await store.updateSource({
        id: source.id,
        status: "skipped" as ResearchSourceStatus,
      });
      ctx.updateLocalSource(skippedSource);
      return skippedSource;
    }

    ctx.updateLocalSource(updatedSource);
    return updatedSource;
  } catch (err) {
    console.warn("[research-runtime] Validation failed for source:", source.id, err);
    const skippedSource = await store.updateSource({
      id: source.id,
      status: "skipped" as ResearchSourceStatus,
      sourceQuality: {
        relevant: false,
        quality: 0,
        reason: `Validation failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
    ctx.updateLocalSource(skippedSource);
    return skippedSource;
  }
}

async function validateSourceBatch(ctx: ResearchRuntimeContext, batch: ResearchSource[]): Promise<void> {
  const { run, config, signal, store, onEvent } = ctx;

  const batchPrompt = buildBatchSourceValidationPrompt(
    batch,
    ctx.clarifiedResearchQuestion || run.question,
    ctx.planContextSummary,
    (s) => ctx.getSourceChunks(s),
  );

  try {
    const { value: batchResponse } = await ctx.runAiStep(
      "extract",
      `Validate batch of ${batch.length} source${batch.length === 1 ? "" : "s"}`,
      "Quality assessment",
      () =>
        callResearchAi(
          [
            { role: "system", content: `${BATCH_VALIDATION_SYSTEM_PROMPT}\n\n${getTemporalContext()}` },
            { role: "user", content: batchPrompt },
          ],
          signal,
          undefined,
          2000 * batch.length,
          ctx.researchAiOptions("lite", { reasoningEnabled: config.validateReasoning }),
        ),
      (v) => `${v.length} chars evaluated`,
    );

    const parsed = safeJsonParse<Array<{
      sourceIndex?: number;
      relevant?: boolean;
      quality?: number;
      relevanceScore?: number;
      credibilityScore?: number;
      currencyScore?: number;
      depthScore?: number;
      reason?: string;
    }>>(batchResponse);

    if (Array.isArray(parsed)) {
      const validatedIndexes = new Set<number>();
      for (const item of parsed) {
        const idx = typeof item.sourceIndex === "number" ? item.sourceIndex - 1 : -1;
        const source = idx >= 0 && idx < batch.length ? batch[idx] : undefined;
        if (!source) continue;
        validatedIndexes.add(idx);

        const { relevant, quality, sourceQuality } = computeSourceQuality(
          item,
          source.url,
          config.minSourceQuality,
        );

        const updatedSource = await store.updateSource({
          id: source.id,
          sourceQuality,
        });

        onEvent({ type: "source_validated", sourceId: source.id, quality, relevant });

        if (!relevant) {
          const skippedSource = await store.updateSource({
            id: source.id,
            status: "skipped" as ResearchSourceStatus,
          });
          ctx.updateLocalSource(skippedSource);
        } else {
          ctx.updateLocalSource(updatedSource);
        }
      }
      for (let idx = 0; idx < batch.length; idx++) {
        if (validatedIndexes.has(idx)) continue;
        const source = batch[idx];
        if (!source) continue;
        await validateSource(ctx, source);
      }
    } else {
      for (const source of batch) {
        ctx.checkAbort();
        await validateSource(ctx, source);
      }
    }
  } catch (err) {
    console.warn("[research-runtime] Batch validation failed, falling back to individual:", err);
    for (const source of batch) {
      ctx.checkAbort();
      await validateSource(ctx, source);
    }
  }
}

export async function validateSources(
  ctx: ResearchRuntimeContext,
  sourceList: ResearchSource[],
  options?: { updateRunStatus?: boolean; progressStartPercent?: number },
): Promise<ResearchSource[]> {
  const { config, sources, onEvent } = ctx;
  const validSources: ResearchSource[] = [];
  const totalToValidate = sourceList.length;
  const shouldUpdateRunStatus = options?.updateRunStatus ?? true;
  const progressStartPercent = options?.progressStartPercent ?? 40;

  onEvent({ type: "validate_progress", done: 0, total: totalToValidate });
  if (totalToValidate === 0) return validSources;

  const batchSize = Math.max(1, config.validateBatchSize);
  let validatedCount = 0;
  let lastProgressPct = -1;
  const emitProgress = () => {
    const pct = totalToValidate > 0 ? Math.floor((validatedCount / totalToValidate) * 10) : 0;
    if (pct !== lastProgressPct) {
      lastProgressPct = pct;
      onEvent({ type: "validate_progress", done: validatedCount, total: totalToValidate });
    }
  };

  const updateProgress = async () => {
    validatedCount++;
    emitProgress();
    if (shouldUpdateRunStatus) {
      await ctx.updateRunStatus("extracting", progressStartPercent + Math.floor((validatedCount / Math.max(totalToValidate, 1)) * 10));
    }
  };

  if (batchSize <= 1) {
    const concurrency = Math.max(1, config.validateConcurrency);
    let cursor = 0;
    async function worker() {
      while (cursor < sourceList.length) {
        ctx.checkAbort();
        const idx = cursor++;
        const source = sourceList[idx];
        if (!source) break;
        await validateSource(ctx, source);
        await updateProgress();
      }
    }
    const workers = Array.from({ length: Math.min(concurrency, sourceList.length) }, () => worker());
    await Promise.all(workers);
  } else {
    for (let i = 0; i < sourceList.length; i += batchSize) {
      ctx.checkAbort();
      const batch = sourceList.slice(i, i + batchSize);
      await validateSourceBatch(ctx, batch);
      for (let j = 0; j < batch.length; j++) {
        await updateProgress();
      }
    }
  }

  onEvent({ type: "validate_progress", done: validatedCount, total: totalToValidate });

  for (const source of sourceList) {
    const current = sources.find((s) => s.id === source.id) ?? source;
    if (isSourceValid(current, config.minSourceQuality)) {
      validSources.push(current);
    }
  }

  return validSources;
}

// ── Claim verification ─────────────────────────────────────────────────────

export async function runClaimVerificationPass(ctx: ResearchRuntimeContext, claimPool: ResearchClaim[]): Promise<void> {
  if (claimPool.length === 0) return;

  const { run, config, signal, store, sources, evidenceList, claims, onEvent } = ctx;
  const evidenceById = new Map(evidenceList.map((evidence) => [evidence.id, evidence]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const verifyBatches = buildVerifyBatches(
    claimPool,
    evidenceList,
    evidenceById,
    sourceById,
    config.verifyBatchSize,
  );

  for (let batchIndex = 0; batchIndex < verifyBatches.length; batchIndex++) {
    ctx.checkAbort();
    const batch = verifyBatches[batchIndex];
    if (batch.length === 0) continue;

    const verifyPrompt = buildClaimVerificationPrompt(batch, run.question);

    try {
      const batchLabel = batch.length === 1
        ? `Verify claim: ${(batch[0]?.claim.claim ?? "").length > 60 ? `${batch[0]?.claim.claim?.slice(0, 57) ?? ""}…` : batch[0]?.claim.claim ?? ""}`
        : `Verify ${batch.length} claims (batched)`;
      const { value: verifyResponse } = await ctx.runAiStep(
        "verify",
        batchLabel,
        `Batch ${batchIndex + 1} of ${verifyBatches.length}`,
        () =>
          callResearchAi(
            [
              { role: "system", content: `${VERIFICATION_SYSTEM_PROMPT}\n\n${getTemporalContext()}` },
              { role: "user", content: verifyPrompt },
            ],
            signal,
            undefined,
            3000,
            { reasoningEnabled: config.verifyReasoning, jsonModeHint: true, ...ctx.researchAiOptions("main") },
          ),
        (v) => `${v.length} chars assessed`,
      );

      const parsedArray = normalizeBatchVerifyArray(safeJsonParse<unknown>(verifyResponse));
      const resultsByIndex = new Map<number, Record<string, unknown>>();
      if (parsedArray && parsedArray.length > 0) {
        parsedArray.forEach((result, position) => {
          const rawIndex = result.claimIndex;
          const index = typeof rawIndex === "number" && rawIndex >= 1 && rawIndex <= batch.length
            ? rawIndex - 1
            : position;
          if (index >= 0 && index < batch.length && !resultsByIndex.has(index)) {
            resultsByIndex.set(index, result);
          }
        });
      }

      for (let i = 0; i < batch.length; i++) {
        const entry = batch[i];
        const verifyJson = resultsByIndex.get(i) ?? {};

        let status = normalizeClaimStatus(verifyJson.status);
        const confidence = typeof verifyJson.confidence === "number" ? verifyJson.confidence : entry.claim.confidence;
        const supportingCount = typeof verifyJson.supportingCount === "number"
          ? verifyJson.supportingCount
          : Array.isArray(verifyJson.supportingSources) ? verifyJson.supportingSources.length : 0;
        const contradictingCount = typeof verifyJson.contradictingCount === "number"
          ? verifyJson.contradictingCount
          : Array.isArray(verifyJson.contradictingSources) ? verifyJson.contradictingSources.length : 0;
        const independentSupport = entry.independentEvidenceCount > 0 || supportingCount > 1;
        const verificationReason = (typeof verifyJson.reason === "string" && verifyJson.reason)
          ? verifyJson.reason
          : `Strength: ${(verifyJson.strength as string) || "unknown"}. Issues: ${(Array.isArray(verifyJson.issues) ? verifyJson.issues.join("; ") : "")}`;

        if (status === "verified" && !independentSupport) {
          status = "partially_verified";
        }
        if (status === "partially_verified" && !independentSupport && confidence < 0.75) {
          status = "unverified";
        }

        const updatedClaim = await store.updateClaim({
          id: entry.claim.id,
          status,
          confidence: Math.min(1, Math.max(0, confidence)),
          verificationReason: independentSupport
            ? verificationReason
            : `${verificationReason} Independent corroboration was not found; status was limited accordingly.`,
        });
        const claimIdx = claims.findIndex((c) => c.id === entry.claim.id);
        if (claimIdx !== -1) claims[claimIdx] = updatedClaim;

        onEvent({ type: "claim_verified", claimId: entry.claim.id, status, supportingSources: supportingCount, contradictingSources: contradictingCount });
      }
    } catch (err) {
      console.warn("[research-runtime] Verification failed for batch of", batch.length, "claims:", err);
      for (const entry of batch) {
        try {
          const updatedClaim = await store.updateClaim({
            id: entry.claim.id,
            status: "unverified" as ResearchClaimStatus,
            confidence: entry.claim.confidence,
            verificationReason: "Batch verification failed; status left as unverified.",
          });
          const claimIdx = claims.findIndex((c) => c.id === entry.claim.id);
          if (claimIdx !== -1) claims[claimIdx] = updatedClaim;
          onEvent({ type: "claim_verified", claimId: entry.claim.id, status: "unverified", supportingSources: 0, contradictingSources: 0 });
        } catch (fallbackErr) {
          console.warn("[research-runtime] Fallback update failed for claim:", entry.claim.id, fallbackErr);
        }
      }
    }
  }
}

// ── Contradiction detection ────────────────────────────────────────────────

async function checkContradictionPair(
  ctx: ResearchRuntimeContext,
  a: ResearchClaim,
  b: ResearchClaim,
): Promise<void> {
  const { run, config, signal, store, claims, contradictions, onEvent } = ctx;

  const contradictionPrompt = buildContradictionCheckPrompt(a, b);

  try {
    const { value: contradictionResponse } = await ctx.runAiStep(
      "verify",
      `Check contradiction`,
      undefined,
      () =>
        callResearchAi(
          [
            { role: "system", content: `${CONTRADICTION_SYSTEM_PROMPT}\n\n${getTemporalContext()}` },
            { role: "user", content: contradictionPrompt },
          ],
          signal,
          undefined,
          1500,
          ctx.researchAiOptions("lite", {
            reasoningEnabled: config.validateReasoning,
            jsonModeHint: true,
          }),
        ),
      (v) => `${v.length} chars analyzed`,
    );

    const contradictionJson = safeJsonParse<{
      contradict?: boolean;
      reason?: string;
      preferredClaim?: string;
      resolution?: string;
    }>(contradictionResponse);

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

      const preferredClaim = contradictionJson.preferredClaim === "A" || contradictionJson.preferredClaim === "B" || contradictionJson.preferredClaim === "neither" || contradictionJson.preferredClaim === "unclear"
        ? contradictionJson.preferredClaim
        : undefined;
      const winner = pickContradictionWinner(contradictionJson.resolution, a, b, preferredClaim);
      if (winner) {
        const winnerClaim = ctx.currentClaim(winner.winnerId === a.id ? a : b);
        const loserClaim = ctx.currentClaim(winner.loserId === a.id ? a : b);
        const updatedLoser = await store.updateClaim({
          id: loserClaim.id,
          contradictedBy: ctx.appendUnique(loserClaim.contradictedBy, winnerClaim.id),
          disputedBy: ctx.appendUnique(loserClaim.disputedBy, winnerClaim.id),
          status: "disputed",
          verificationReason: `Disputed by claim ${winnerClaim.id}: ${contradictionJson.resolution || "(no resolution)"}`,
        });
        const updatedWinner = await store.updateClaim({
          id: winnerClaim.id,
          contradictedBy: ctx.appendUnique(winnerClaim.contradictedBy, loserClaim.id),
        });
        const localWinnerIdx = claims.findIndex((c) => c.id === winnerClaim.id);
        if (localWinnerIdx !== -1) claims[localWinnerIdx] = updatedWinner;
        const localLoserIdx = claims.findIndex((c) => c.id === loserClaim.id);
        if (localLoserIdx !== -1) claims[localLoserIdx] = updatedLoser;
      } else {
        const currentA = ctx.currentClaim(a);
        const currentB = ctx.currentClaim(b);
        const updatedA = await store.updateClaim({
          id: currentA.id,
          contradictedBy: ctx.appendUnique(currentA.contradictedBy, currentB.id),
          disputedBy: ctx.appendUnique(currentA.disputedBy, currentB.id),
          status: "disputed",
          verificationReason: `Unresolved contradiction with claim ${currentB.id}: ${contradictionJson.resolution || contradictionJson.reason || "No resolution provided"}`,
        });
        const updatedB = await store.updateClaim({
          id: currentB.id,
          contradictedBy: ctx.appendUnique(currentB.contradictedBy, currentA.id),
          disputedBy: ctx.appendUnique(currentB.disputedBy, currentA.id),
          status: "disputed",
          verificationReason: `Unresolved contradiction with claim ${currentA.id}: ${contradictionJson.resolution || contradictionJson.reason || "No resolution provided"}`,
        });
        const localAIdx = claims.findIndex((c) => c.id === a.id);
        if (localAIdx !== -1) claims[localAIdx] = updatedA;
        const localBIdx = claims.findIndex((c) => c.id === b.id);
        if (localBIdx !== -1) claims[localBIdx] = updatedB;
      }

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

// ── Validation phase (runs before extraction) ────────────────────────────────

export async function validatePhase(
  ctx: ResearchRuntimeContext,
): Promise<void> {
  const { config, onEvent } = ctx;
  if (!config.perSourceRead) return;
  const sourcesToValidate = ctx.sources.filter((s) => s.status === "read");
  if (sourcesToValidate.length === 0) return;

  ctx.checkAbort();
  const validateStep = await ctx.createStep("extract", "Validating source quality and relevance");
  onEvent({ type: "phase_start", phase: "validate", stepId: validateStep.id });
  await ctx.updateRunStatus("extracting", 40);

  const validSources = await validateSources(ctx, sourcesToValidate, { updateRunStatus: true, progressStartPercent: 40 });
  await ctx.completeStep(validateStep, `Validated ${validSources.length} of ${sourcesToValidate.length} sources as high-quality`);
  onEvent({ type: "phase_complete", phase: "validate", stepId: validateStep.id });
}

// ── Full verify phase ──────────────────────────────────────────────────────

export async function verifyPhase(
  ctx: ResearchRuntimeContext,
  resumeFromPhase?: string,
): Promise<void> {
  const { config, claims, evidenceList, contradictions, onEvent } = ctx;

  // Cross-source verification
  if (config.crossSourceVerify && claims.length > 0 && !(resumeFromPhase && claims.every((c) => c.status !== "extracted"))) {
    ctx.checkAbort();
    const verifyStep = await ctx.createStep("verify", "Cross-source verification");
    onEvent({ type: "phase_start", phase: "verify", stepId: verifyStep.id });
    await ctx.updateRunStatus("verifying", 65);

    await runClaimVerificationPass(ctx, claims);

    let contradictionSkipped = false;
    if (config.contradictionDetect) {
      const verifiedOrPartial = claims.filter((c) => c.status === "verified" || c.status === "partially_verified");

      if (verifiedOrPartial.length < config.contradictionMinClaims) {
        onEvent({ type: "contradiction_progress", done: 0, total: 0 });
        await ctx.completeStep(verifyStep, `Verified ${claims.length} claims (contradiction skipped: only ${verifiedOrPartial.length} verified, below threshold of ${config.contradictionMinClaims})`);
        onEvent({ type: "phase_complete", phase: "verify", stepId: verifyStep.id });
        contradictionSkipped = true;
      } else {
        let candidates: ResearchClaim[] = verifiedOrPartial;
        if (config.contradictionStrategy === "top_k") {
          candidates = [...verifiedOrPartial]
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, config.contradictionTopK);
        }

        const evidenceById = new Map(evidenceList.map((evidence) => [evidence.id, evidence]));

        const allPairs = generateContradictionPairs(candidates);
        const rankedPairs = rankContradictionPairs(allPairs, evidenceById);
        const pairs = filterAndCapPairs(rankedPairs, config.contradictionMaxPairs);
        const totalPairs = pairs.length;
        if (totalPairs > 500) {
          console.warn(
            `[research-runtime] Contradiction detection will check ${totalPairs} pairs. This may be slow on local models; consider Top-K or a lower max-pairs cap.`,
          );
        }

        let donePairs = 0;
        onEvent({ type: "contradiction_progress", done: 0, total: totalPairs });
        let lastCpPct = -1;
        const emitCp = () => {
          const pct = totalPairs > 0 ? Math.floor((donePairs / totalPairs) * 10) : 0;
          if (pct !== lastCpPct) {
            lastCpPct = pct;
            onEvent({ type: "contradiction_progress", done: donePairs, total: totalPairs });
          }
        };

        const cconcurrency = Math.max(1, config.contradictionConcurrency);
        let cursor = 0;
        async function cworker() {
          while (cursor < pairs.length) {
            ctx.checkAbort();
            const idx = cursor++;
            const pair = pairs[idx];
            if (!pair) break;
            await checkContradictionPair(ctx, pair.a, pair.b);
            donePairs++;
            emitCp();
          }
        }
        const cworkers = Array.from({ length: Math.min(cconcurrency, pairs.length) }, () => cworker());
        await Promise.all(cworkers);

        onEvent({ type: "contradiction_progress", done: donePairs, total: totalPairs });
        const skippedPairs = allPairs.length - pairs.length;
        const skipNote = skippedPairs > 0 ? ` (${skippedPairs} pairs skipped due to cap/strategy)` : "";
        await ctx.completeStep(verifyStep, `Verified ${claims.length} claims, found ${contradictions.length} contradictions across ${totalPairs} pairs${skipNote}`);
      }
    } else {
      await ctx.completeStep(verifyStep, `Verified ${claims.length} claims (contradiction detection disabled)`);
    }
    if (!contradictionSkipped) {
      onEvent({ type: "phase_complete", phase: "verify", stepId: verifyStep.id });
    }
  } else if (resumeFromPhase && claims.length > 0) {
    console.info(`[research-runtime] Resume reusing ${claims.length} persisted claims`);
  }
}
