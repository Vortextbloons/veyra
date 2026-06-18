import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import type { MemoryMode } from "@/modules/memory/memory-types";
import { Toggle } from "@/components/toggle";
import { ModelDropdown } from "@/components/settings/model-dropdown";
import { SliderControl } from "@/components/ui/slider-control";

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
    </div>
  );
}
