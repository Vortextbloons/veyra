import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import type { MemoryMode } from "@/modules/memory/memory-types";
import { Toggle } from "@/components/toggle";
import { ModelDropdown } from "@/components/settings/model-dropdown";
import { SliderControl } from "@/components/ui/slider-control";
import { useState, useCallback } from "react";
import {
  computeAllEmbeddings,
  findDuplicateNodes,
  getEmbeddingStatus,
  type DuplicatePair,
  type EmbeddingStatus,
} from "@/modules/memory/memory-storage";

const MEMORY_MODES: { value: MemoryMode; label: string; description: string }[] = [
  {
    value: "off",
    label: "Off",
    description: "Memory system is completely disabled",
  },
  {
    value: "manual_only",
    label: "Manual only",
    description: "Only save memories when you explicitly request it",
  },
  {
    value: "safe_auto_save",
    label: "Safe auto-save",
    description: "Automatically save important facts, with review available",
  },
  {
    value: "review_all",
    label: "Review all",
    description: "Auto-save everything, but require approval before committing",
  },
  {
    value: "aggressive_project_memory",
    label: "Aggressive",
    description: "Aggressively extract and save all project context",
  },
];

function formatLabel(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}K`;
  return `${n}`;
}

export function MemoriesSettings() {
  const memoryMode = useSettingsStore((s) => s.memoryMode);
  const setMemoryMode = useSettingsStore((s) => s.setMemoryMode);
  const maxMemoryTokens = useSettingsStore((s) => s.maxMemoryTokens);
  const setMaxMemoryTokens = useSettingsStore((s) => s.setMaxMemoryTokens);
  const maxMemoryNodes = useSettingsStore((s) => s.maxMemoryNodes);
  const setMaxMemoryNodes = useSettingsStore((s) => s.setMaxMemoryNodes);
  const maxMemoryFiles = useSettingsStore((s) => s.maxMemoryFiles);
  const setMaxMemoryFiles = useSettingsStore((s) => s.setMaxMemoryFiles);
  const maxGraphDepth = useSettingsStore((s) => s.maxGraphDepth);
  const setMaxGraphDepth = useSettingsStore((s) => s.setMaxGraphDepth);
  const defaultMemoryEnabled = useSettingsStore((s) => s.defaultMemoryEnabled);
  const setDefaultMemoryEnabled = useSettingsStore((s) => s.setDefaultMemoryEnabled);
  const memoryExtractionEnabled = useSettingsStore((s) => s.memoryExtractionEnabled);
  const setMemoryExtractionEnabled = useSettingsStore((s) => s.setMemoryExtractionEnabled);
  const memoryExtractionModel = useSettingsStore((s) => s.memoryExtractionModel);
  const setMemoryExtractionModel = useSettingsStore((s) => s.setMemoryExtractionModel);
  const models = useProviderStore((s) => s.models);

  // Vector search settings
  const vectorSearchEnabled = useSettingsStore((s) => s.vectorSearchEnabled);
  const setVectorSearchEnabled = useSettingsStore((s) => s.setVectorSearchEnabled);
  const vectorSearchEndpointUrl = useSettingsStore((s) => s.vectorSearchEndpointUrl);
  const setVectorSearchEndpointUrl = useSettingsStore((s) => s.setVectorSearchEndpointUrl);
  const vectorSearchModel = useSettingsStore((s) => s.vectorSearchModel);
  const setVectorSearchModel = useSettingsStore((s) => s.setVectorSearchModel);
  const vectorWeight = useSettingsStore((s) => s.vectorWeight);
  const setVectorWeight = useSettingsStore((s) => s.setVectorWeight);
  const bm25Weight = useSettingsStore((s) => s.bm25Weight);
  const setBm25Weight = useSettingsStore((s) => s.setBm25Weight);
  const metaWeight = useSettingsStore((s) => s.metaWeight);
  const setMetaWeight = useSettingsStore((s) => s.setMetaWeight);
  const vectorDuplicateThreshold = useSettingsStore((s) => s.vectorDuplicateThreshold);
  const setVectorDuplicateThreshold = useSettingsStore((s) => s.setVectorDuplicateThreshold);

  // Embedding status
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null);
  const [isComputingEmbeddings, setIsComputingEmbeddings] = useState(false);
  const [embeddingError, setEmbeddingError] = useState<string | null>(null);
  const [duplicatePairs, setDuplicatePairs] = useState<DuplicatePair[]>([]);
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
  const [duplicateScanError, setDuplicateScanError] = useState<string | null>(null);

  const checkEmbeddingStatus = useCallback(async () => {
    try {
      const status = await getEmbeddingStatus();
      setEmbeddingStatus(status);
      setEmbeddingError(null);
    } catch (err) {
      setEmbeddingError(err instanceof Error ? err.message : "Failed to check status");
    }
  }, []);

  const handleComputeEmbeddings = useCallback(async () => {
    setIsComputingEmbeddings(true);
    setEmbeddingError(null);
    try {
      const count = await computeAllEmbeddings({
        endpointUrl: vectorSearchEndpointUrl.trim() || undefined,
        model: vectorSearchModel.trim() || undefined,
      });
      // Refresh status after computation
      const status = await getEmbeddingStatus();
      setEmbeddingStatus(status);
      if (count > 0) {
        setEmbeddingError(null);
      }
    } catch (err) {
      setEmbeddingError(err instanceof Error ? err.message : "Failed to compute embeddings");
    } finally {
      setIsComputingEmbeddings(false);
    }
  }, [vectorSearchEndpointUrl, vectorSearchModel]);

  const handleScanDuplicates = useCallback(async () => {
    setIsScanningDuplicates(true);
    setDuplicateScanError(null);
    try {
      const pairs = await findDuplicateNodes(vectorDuplicateThreshold);
      setDuplicatePairs(pairs);
    } catch (err) {
      setDuplicateScanError(err instanceof Error ? err.message : "Failed to scan duplicates");
    } finally {
      setIsScanningDuplicates(false);
    }
  }, [vectorDuplicateThreshold]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Memory Mode
        </h2>
        <div className="space-y-1">
          {MEMORY_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setMemoryMode(mode.value)}
              className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                memoryMode === mode.value
                  ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]"
                  : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-[var(--color-border-strong)]"
              }`}
            >
              <div
                className={`mt-0.5 size-3.5 shrink-0 rounded-full border-2 ${
                  memoryMode === mode.value
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
                    : "border-[var(--color-text-dim)]"
                }`}
              />
              <div>
                <div
                  className={`text-[12.5px] font-medium ${
                    memoryMode === mode.value ? "text-white" : "text-[var(--color-text)]"
                  }`}
                >
                  {mode.label}
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)]">
                  {mode.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Memory AI
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Default memory for new chats"
              on={defaultMemoryEnabled}
              onChange={setDefaultMemoryEnabled}
            />
            <Toggle
              label="Auto-extract memories in batches"
              on={memoryExtractionEnabled}
              onChange={setMemoryExtractionEnabled}
            />
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Veyra waits for a batch of chat context before asking the memory AI to extract durable memories.
          </p>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2">
              <div className="text-[12.5px] font-medium text-white">
                Memory AI model
              </div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Model used to decide what should become memory. Leave empty to use the summary model, then the selected chat model.
              </div>
            </div>
            <ModelDropdown
              models={models}
              value={memoryExtractionModel}
              onChange={setMemoryExtractionModel}
              placeholder="Use summary/chat model"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Limits
        </h2>
        <div className="space-y-3">
          <SliderControl
            variant="card"
            label="Max memory tokens"
            description="Token budget for memory context injected into chats"
            value={maxMemoryTokens}
            onChange={setMaxMemoryTokens}
            min={100}
            max={4000}
            step={100}
            formatValue={formatLabel}
          />
          <SliderControl
            variant="card"
            label="Max memory nodes"
            description="Maximum number of memory nodes retrieved per query"
            value={maxMemoryNodes}
            onChange={setMaxMemoryNodes}
            min={1}
            max={50}
            step={1}
            formatValue={(n) => `${n}`}
          />
          <SliderControl
            variant="card"
            label="Max memory files"
            description="Maximum number of memory files to search"
            value={maxMemoryFiles}
            onChange={setMaxMemoryFiles}
            min={1}
            max={20}
            step={1}
            formatValue={(n) => `${n}`}
          />
          <SliderControl
            variant="card"
              label="Memory graph hops"
              description="How many hops to follow in the memory graph"
            value={maxGraphDepth}
            onChange={setMaxGraphDepth}
            min={0}
            max={5}
            step={1}
            formatValue={(n) => `${n}`}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Vector Search
        </h2>
        <div className="space-y-3">
          <Toggle
            label="Enable vector search"
            on={vectorSearchEnabled}
            onChange={setVectorSearchEnabled}
          />
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Uses local embeddings (via LM Studio or Ollama) for semantic similarity search.
            Falls back to keyword-only when disabled or unavailable.
          </p>

          {vectorSearchEnabled && (
            <>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 space-y-3">
                <div>
                  <div className="text-[12.5px] font-medium text-white">
                    Embedding endpoint
                  </div>
                  <div className="text-[11px] text-[var(--color-text-dim)]">
                    URL of the LM Studio or Ollama embedding server. Leave empty to auto-detect.
                  </div>
                </div>
                <input
                  type="text"
                  value={vectorSearchEndpointUrl}
                  onChange={(e) => setVectorSearchEndpointUrl(e.target.value)}
                  placeholder="Auto-detect (localhost:1234, localhost:11434)"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[12px] text-white placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 space-y-3">
                <div>
                  <div className="text-[12.5px] font-medium text-white">
                    Embedding model
                  </div>
                  <div className="text-[11px] text-[var(--color-text-dim)]">
                    Model name for embedding computation. Leave empty to auto-detect.
                  </div>
                </div>
                <input
                  type="text"
                  value={vectorSearchModel}
                  onChange={(e) => setVectorSearchModel(e.target.value)}
                  placeholder="Auto-detect"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[12px] text-white placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 space-y-4">
                <div>
                  <div className="text-[12.5px] font-medium text-white">
                    Hybrid scoring weights
                  </div>
                  <div className="text-[11px] text-[var(--color-text-dim)]">
                    Adjust the balance between vector similarity, keyword matching, and metadata boosting.
                  </div>
                </div>
                <div className="space-y-3">
                  <SliderControl
                    variant="compact"
                    label="Vector similarity"
                    value={vectorWeight}
                    onChange={setVectorWeight}
                    min={0}
                    max={1}
                    step={0.05}
                    formatValue={(n) => `${(n * 100).toFixed(0)}%`}
                  />
                  <SliderControl
                    variant="compact"
                    label="BM25 keyword"
                    value={bm25Weight}
                    onChange={setBm25Weight}
                    min={0}
                    max={1}
                    step={0.05}
                    formatValue={(n) => `${(n * 100).toFixed(0)}%`}
                  />
                  <SliderControl
                    variant="compact"
                    label="Metadata boost"
                    value={metaWeight}
                    onChange={setMetaWeight}
                    min={0}
                    max={1}
                    step={0.05}
                    formatValue={(n) => `${(n * 100).toFixed(0)}%`}
                  />
                  <div className="text-[10px] text-[var(--color-text-dim)]">
                    Total: {((vectorWeight + bm25Weight + metaWeight) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 space-y-3">
                <div>
                  <div className="text-[12.5px] font-medium text-white">
                    Duplicate detection threshold
                  </div>
                  <div className="text-[11px] text-[var(--color-text-dim)]">
                    Cosine similarity above which memories are considered duplicates (0.92 = strict).
                  </div>
                </div>
                <SliderControl
                  variant="compact"
                  label="Similarity threshold"
                  value={vectorDuplicateThreshold}
                  onChange={setVectorDuplicateThreshold}
                  min={0.8}
                  max={0.99}
                  step={0.01}
                  formatValue={(n) => `${n.toFixed(2)}`}
                />
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 space-y-3">
                <div>
                  <div className="text-[12.5px] font-medium text-white">
                    Embedding status
                  </div>
                  <div className="text-[11px] text-[var(--color-text-dim)]">
                    {embeddingStatus
                      ? `${embeddingStatus.embeddedCount} of ${embeddingStatus.totalNodes} nodes embedded`
                      : "Click refresh to check status"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={checkEmbeddingStatus}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/[0.06]"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={handleComputeEmbeddings}
                    disabled={isComputingEmbeddings}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isComputingEmbeddings ? "Computing..." : "Compute embeddings"}
                  </button>
                  <button
                    type="button"
                    onClick={handleScanDuplicates}
                    disabled={isScanningDuplicates}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isScanningDuplicates ? "Scanning..." : "Scan duplicates"}
                  </button>
                </div>
                {embeddingError && (
                  <p className="text-[11px] text-red-400">{embeddingError}</p>
                )}
                {duplicateScanError && (
                  <p className="text-[11px] text-red-400">{duplicateScanError}</p>
                )}
                {embeddingStatus && embeddingStatus.missingIds.length > 0 && (
                  <p className="text-[11px] text-amber-400">
                    {embeddingStatus.missingIds.length} nodes missing embeddings
                  </p>
                )}
                {duplicatePairs.length > 0 && (
                  <p className="text-[11px] text-amber-400">
                    {duplicatePairs.length} duplicate pairs found. Highest similarity: {Math.max(...duplicatePairs.map((p) => p.similarity)).toFixed(2)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
