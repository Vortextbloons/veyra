import type { ResearchSource } from "./research-types";
import type { ResearchRuntimeContext } from "./research-runtime-context";
import { callResearchAi } from "./research-ai";
import { sourceTypeLabel, untrustedSourceBlock } from "./research-source-utils";
import { maxOutputTokensForExtractBatch, buildAdaptiveExtractBatches } from "./research-citation-utils";
import { parseResearchEvidenceArray } from "./extraction-json";
import { EXTRACT_JSON_SYSTEM, EXTRACT_BATCH_JSON_SYSTEM, EXTRACT_BATCH_JSON_SYSTEM_STRICT, EXTRACT_JSON_RESPONSE_FORMAT, buildBatchPrompt, type ExtractionWorkItem } from "./research-extraction-prompts";
import { persistOneEvidenceItem } from "./research-extraction-per-source";

type WorkItem = ExtractionWorkItem;

export async function extractFromSourcesBatch(
  ctx: ResearchRuntimeContext,
  sourceList: ResearchSource[],
  stepId: string,
  followUp: boolean,
  gapContext?: string,
): Promise<{ extracted: number; parseFailed: number; filteredOut: number; skippedEmpty: number }> {
  const { run, config, signal, store, evidenceList, claims, onEvent } = ctx;
  const batchSize = Math.max(1, config.extractBatchSize);

  const workItems: WorkItem[] = [];
  let skippedEmpty = 0;

  for (const source of sourceList) {
    const text = source.fullText || source.snippet || "";
    if (text.trim().length < 50) {
      console.warn(`[research-runtime] Skipping extraction for source ${source.id}: content too short (${text.trim().length} chars)`);
      skippedEmpty++;
      continue;
    }
    const chunks = ctx.getSourceChunks(source);
    if (chunks.length === 0) {
      skippedEmpty++;
      continue;
    }
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      if (chunk == null) continue;
      workItems.push({ source, chunkIndex, chunk });
    }
  }

  let extracted = 0;
  let parseFailed = 0;
  let filteredOut = 0;

  if (workItems.length === 0) {
    return { extracted, parseFailed, filteredOut, skippedEmpty };
  }

  const workBySource = new Map<string, WorkItem[]>();
  for (const w of workItems) {
    const list = workBySource.get(w.source.id) || [];
    list.push(w);
    workBySource.set(w.source.id, list);
  }
  const orderedSources: ResearchSource[] = [];
  for (const w of workItems) {
    if (!orderedSources.find((s) => s.id === w.source.id)) orderedSources.push(w.source);
  }

  const sourceBatches = buildAdaptiveExtractBatches(orderedSources, workBySource, batchSize);

  const persistOne = async (item: Record<string, unknown>, source: ResearchSource): Promise<boolean> => {
    const result = await persistOneEvidenceItem(item, source, {
      runId: run.id,
      stepId,
      store,
      evidenceList,
      claims,
      onEvent,
    });
    if (result.wasFiltered) filteredOut++;
    if (result.persisted) extracted++;
    return result.persisted;
  };

  const extractAiOptions = (temperature = 0) => ({
    reasoningEnabled: false as const,
    responseFormat: EXTRACT_JSON_RESPONSE_FORMAT,
    temperature,
    ...ctx.researchAiOptions("main"),
  });

  const processSourceBatch = async (
    sourceBatch: ResearchSource[],
    sharedEvidenceIds?: Set<string>,
  ): Promise<boolean> => {
    if (sourceBatch.length === 0) return false;

    const batchSourceCount = sourceBatch.length;
    const batchPrompt = buildBatchPrompt(sourceBatch, workBySource, run, followUp, gapContext);
    const sourcesWithEvidence = sharedEvidenceIds ?? new Set<string>();

    type ParseStatus = "ok" | "empty" | "failed";

    const tryParseAndPersist = async (response: string): Promise<ParseStatus> => {
      const arr = parseResearchEvidenceArray(response);
      if (arr === null) {
        if (response.trim().length > 0) {
          console.warn(
            `[research-runtime] Extraction JSON parse failed (${response.length} chars, salvage attempted), preview:`,
            response.slice(0, 500),
          );
        }
        return "failed";
      }
      if (arr.length === 0) {
        return "empty";
      }
      let persisted = 0;
      for (const item of arr) {
        const idxRaw = item.sourceIndex;
        let source = sourceBatch[0];
        if (typeof idxRaw === "number" && idxRaw >= 1 && idxRaw <= sourceBatch.length) {
          const aliased = sourceBatch[idxRaw - 1];
          if (aliased) source = aliased;
        } else if (sourceBatch.length === 1) {
          source = sourceBatch[0] ?? source;
        }
        if (await persistOne(item, source)) {
          persisted++;
          sourcesWithEvidence.add(source.id);
        }
      }
      return persisted > 0 ? "ok" : "empty";
    };

    const extractChunksForSources = async (
      extractSources: ResearchSource[],
      chunkFilter: (it: WorkItem) => boolean,
      detail: string,
      systemMessage = EXTRACT_JSON_SYSTEM,
      temperature = 0,
    ) => {
      for (const source of extractSources) {
        ctx.checkAbort();
        const items = workBySource.get(source.id) || [];
        for (const it of items) {
          if (!chunkFilter(it)) continue;
          ctx.checkAbort();
          const singlePrompt = `You are a meticulous research analyst. Extract ${followUp ? "NEW " : ""}evidence from this source that is DIRECTLY RELEVANT to the research question.

Research Question: "${run.question}"
${followUp && gapContext ? `\nResearch Gaps to Fill:\n${gapContext}\n` : ""}
Source: ${source.title}
URL: ${source.url}
Type: ${sourceTypeLabel(source.sourceType)}
Chunk: ${it.chunkIndex + 1} of ${items.length}

Content:
${untrustedSourceBlock(source.url, it.chunk, source.sourceType)}

Extract only items that pertain to the research question:
1. DIRECT QUOTES with exact wording (use "type": "quote")
2. STATISTICS and numbers (use "type": "statistic")
3. SPECIFIC CLAIMS made by the source (use "type": "claim")
4. VERIFIABLE FACTS (use "type": "fact")

For EACH piece of evidence, provide:
- "content": 1-3 sentences — the specific text or a precise summary (keep each under ~200 characters)
- "confidence": 0.0-1.0 — use 0.9+ for verified facts, 0.7-0.9 for reliable sources, 0.5-0.7 for unverified claims
- "significance": "high", "medium", or "low" — how important is this to the research question?

If nothing in this chunk is relevant to the research question, return {"evidence":[]}. Do NOT fabricate evidence.
Return ONLY this JSON object: {"evidence":[{"type":"fact","content":"...","confidence":0.8,"significance":"medium"}]}.`;

          try {
            const { value: singleResponse } = await ctx.runAiStep(
              "extract",
              `Extract chunk ${it.chunkIndex + 1}/${items.length}: ${source.title.length > 60 ? `${source.title.slice(0, 57)}…` : source.title}`,
              detail,
              () =>
                callResearchAi(
                  [
                    { role: "system", content: systemMessage },
                    { role: "user", content: singlePrompt },
                  ],
                  signal,
                  undefined,
                  followUp ? 6000 : 12000,
                  { ...extractAiOptions(temperature) },
                ),
              (v) => `${v.length} chars parsed`,
            );
            const singleResult = await tryParseAndPersist(singleResponse);
            if (singleResult === "failed") parseFailed++;
          } catch (innerErr) {
            console.warn("[research-runtime] Per-chunk extraction failed:", source.id, it.chunkIndex + 1, innerErr);
            parseFailed++;
          }
        }
      }
    };

    const runBatchExtract = async (
      systemMessage: string,
      temperature = 0,
    ): Promise<string> => {
      const batchMaxTokens = maxOutputTokensForExtractBatch(batchSourceCount, followUp);
      const { value } = await ctx.runAiStep(
        "extract",
        `Extract batch of ${batchSourceCount} source${batchSourceCount === 1 ? "" : "s"}: ${(sourceBatch[0]?.title ?? "").length > 40 ? `${sourceBatch[0]?.title?.slice(0, 37) ?? ""}…` : sourceBatch[0]?.title ?? ""}${batchSourceCount > 1 ? ` +${batchSourceCount - 1}` : ""}`,
        followUp ? "Follow-up extraction" : "Initial extraction",
        () =>
          callResearchAi(
            [
              { role: "system", content: systemMessage },
              { role: "user", content: batchPrompt },
            ],
            signal,
            undefined,
            batchMaxTokens,
            { ...extractAiOptions(temperature) },
          ),
        (v) => `${v.length} chars parsed`,
      );
      return value;
    };

    const runBatchAttempts = async (): Promise<ParseStatus> => {
      let result = await tryParseAndPersist(await runBatchExtract(EXTRACT_BATCH_JSON_SYSTEM, 0));
      if (result === "failed") {
        result = await tryParseAndPersist(await runBatchExtract(EXTRACT_BATCH_JSON_SYSTEM_STRICT, 0));
      }
      return result;
    };

    const sourcesMissingEvidence = () =>
      sourceBatch.filter((source) => !sourcesWithEvidence.has(source.id));

    let batchSucceeded = false;

    try {
      let batchResult = await runBatchAttempts();
      const truncated = batchResult === "ok" && sourcesMissingEvidence().length > 0;

      if (batchResult === "failed" && batchSourceCount > 1) {
        const mid = Math.ceil(batchSourceCount / 2);
        const halves = [sourceBatch.slice(0, mid), sourceBatch.slice(mid)];
        for (const half of halves) {
          if (half.length === 0) continue;
          ctx.checkAbort();
          const halfSucceeded = await processSourceBatch(half, sourcesWithEvidence);
          if (halfSucceeded) batchResult = "ok";
        }
      }

      const stillMissing = sourcesMissingEvidence();
      if (stillMissing.length > 0 && batchSourceCount > 1) {
        for (const source of stillMissing) {
          ctx.checkAbort();
          const singleSucceeded = await processSourceBatch([source], sourcesWithEvidence);
          if (singleSucceeded) batchResult = "ok";
        }
      }

      const needChunkFallback = sourcesMissingEvidence();
      if (needChunkFallback.length > 0) {
        if (batchResult === "failed") {
          parseFailed++;
          console.warn(
            "[research-runtime] Batched extraction failed, falling back to per-source:",
            needChunkFallback.map((s) => s.id).join(","),
            truncated ? "partial batch response" : "batch response was not valid JSON",
          );
        }
        await extractChunksForSources(
          needChunkFallback,
          (it) => it.chunkIndex === 0,
          batchResult === "failed" ? "Per-source fallback (chunk 1)" : "Per-source retry (missing sources)",
        );
      } else {
        batchSucceeded = batchResult === "ok" || sourcesWithEvidence.size > 0;
        if (batchResult === "empty" && batchSourceCount > 1 && sourcesWithEvidence.size === 0) {
          await extractChunksForSources(
            sourceBatch,
            (it) => it.chunkIndex === 0,
            "Per-source retry (batch returned empty)",
          );
        }
      }
    } catch (err) {
      parseFailed++;
      console.warn(
        "[research-runtime] Batched extraction failed, falling back to per-source:",
        sourceBatch.map((s) => s.id).join(","),
        err,
      );
      await extractChunksForSources(
        sourcesMissingEvidence().length > 0 ? sourcesMissingEvidence() : sourceBatch,
        (it) => it.chunkIndex === 0,
        "Per-source fallback (batch error)",
      );
    }

    return batchSucceeded || sourcesWithEvidence.size > 0;
  };

  for (const sourceBatch of sourceBatches) {
    ctx.checkAbort();
    if (sourceBatch.length === 0) continue;

    let batchSucceeded = false;
    try {
      batchSucceeded = await processSourceBatch(sourceBatch);
    } catch (err) {
      parseFailed++;
      console.warn("[research-runtime] Source batch extraction failed:", sourceBatch.map((s) => s.id).join(","), err);
    }

    const extractChunksForBatch = async (
      batchSources: ResearchSource[],
      chunkFilter: (it: WorkItem) => boolean,
      detail: string,
    ) => {
      for (const source of batchSources) {
        ctx.checkAbort();
        const items = workBySource.get(source.id) || [];
        for (const it of items) {
          if (!chunkFilter(it)) continue;
          ctx.checkAbort();
          const singlePrompt = `You are a meticulous research analyst. Extract ${followUp ? "NEW " : ""}evidence from this source that is DIRECTLY RELEVANT to the research question.

Research Question: "${run.question}"
${followUp && gapContext ? `\nResearch Gaps to Fill:\n${gapContext}\n` : ""}
Source: ${source.title}
URL: ${source.url}
Type: ${sourceTypeLabel(source.sourceType)}
Chunk: ${it.chunkIndex + 1} of ${items.length}

Content:
${untrustedSourceBlock(source.url, it.chunk, source.sourceType)}

For EACH piece of evidence, provide content, confidence, and significance. Keep each content under ~200 characters.
If nothing is relevant, return {"evidence":[]}.
Return ONLY this JSON object: {"evidence":[{"type":"fact","content":"...","confidence":0.8,"significance":"medium"}]}.`;

          try {
            const { value: singleResponse } = await ctx.runAiStep(
              "extract",
              `Extract chunk ${it.chunkIndex + 1}/${items.length}: ${source.title.length > 60 ? `${source.title.slice(0, 57)}…` : source.title}`,
              detail,
              () =>
                callResearchAi(
                  [
                    { role: "system", content: EXTRACT_JSON_SYSTEM },
                    { role: "user", content: singlePrompt },
                  ],
                  signal,
                  undefined,
                  followUp ? 6000 : 12000,
                  { ...extractAiOptions(0) },
                ),
              (v) => `${v.length} chars parsed`,
            );
            const arr = parseResearchEvidenceArray(singleResponse);
            if (arr === null) {
              parseFailed++;
              continue;
            }
            for (const item of arr) {
              await persistOne(item, source);
            }
          } catch (innerErr) {
            console.warn("[research-runtime] Additional chunk extraction failed:", source.id, it.chunkIndex + 1, innerErr);
            parseFailed++;
          }
        }
      }
    };

    const hasAdditionalChunks = sourceBatch.some((source) => {
      const items = workBySource.get(source.id) || [];
      return items.length > 1;
    });
    if (hasAdditionalChunks) {
      await extractChunksForBatch(
        sourceBatch,
        (it) => it.chunkIndex >= 1,
        batchSucceeded ? "Additional chunk extraction" : "Additional chunk extraction (post-fallback)",
      );
    }
  }

  if (extracted === 0 && sourceList.length > 0 && skippedEmpty === 0) {
    console.warn(`[research-runtime] Extraction produced 0 valid items for ${sourceList.length} sources`);
  }

  return { extracted, parseFailed, filteredOut, skippedEmpty };
}

export async function extractPhase(
  ctx: ResearchRuntimeContext,
  resumeFromPhase?: string,
): Promise<void> {
  const { config, sources, evidenceList, onEvent } = ctx;

  const activeSources = sources.filter((s) =>
    s.status === "read" &&
    s.sourceQuality?.relevant !== false &&
    (typeof s.sourceQuality?.quality !== "number" || s.sourceQuality.quality >= config.minSourceQuality)
  );

  if (config.perSourceRead && activeSources.length > 0 && !(resumeFromPhase && evidenceList.length > 0)) {
    ctx.checkAbort();
    const extractStep = await ctx.createStep("extract", "Deep evidence extraction");
    onEvent({ type: "phase_start", phase: "extract", stepId: extractStep.id });
    await ctx.updateRunStatus("extracting", 50);

    let skippedEmpty = 0;
    let parseFailed = 0;
    let filteredOut = 0;

    ctx.checkAbort();
    const extractResult = await extractFromSourcesBatch(ctx, activeSources, extractStep.id, false);
    skippedEmpty += extractResult.skippedEmpty;
    parseFailed += extractResult.parseFailed;
    filteredOut += extractResult.filteredOut;

    if (skippedEmpty > 0 || parseFailed > 0 || filteredOut > 0) {
      console.warn(`[research-runtime] Extraction diagnostics: ${skippedEmpty} skipped (empty content), ${parseFailed} parse failures, ${filteredOut} items filtered (short/missing content)`);
    }

    await ctx.completeStep(extractStep, `Extracted ${evidenceList.length} evidence items from ${activeSources.length} sources`);
    onEvent({ type: "phase_complete", phase: "extract", stepId: extractStep.id });
  } else if (resumeFromPhase && evidenceList.length > 0) {
    console.info(`[research-runtime] Resume reusing ${evidenceList.length} persisted evidence items`);
  }
}
