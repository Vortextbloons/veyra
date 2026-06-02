import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import type { MemoryMode } from "@/lib/memory-types";
import { Toggle } from "@/components/toggle";
import { Cpu, ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import { ModelIcon } from "@/components/model-icon";

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
          <LimitControl
            label="Max memory tokens"
            description="Token budget for memory context injected into chats"
            value={maxMemoryTokens}
            onChange={setMaxMemoryTokens}
            min={100}
            max={4000}
            step={100}
            format={formatLabel}
          />
          <LimitControl
            label="Max memory nodes"
            description="Maximum number of memory nodes retrieved per query"
            value={maxMemoryNodes}
            onChange={setMaxMemoryNodes}
            min={1}
            max={50}
            step={1}
            format={(n) => `${n}`}
          />
          <LimitControl
            label="Max memory files"
            description="Maximum number of memory files to search"
            value={maxMemoryFiles}
            onChange={setMaxMemoryFiles}
            min={1}
            max={20}
            step={1}
            format={(n) => `${n}`}
          />
          <LimitControl
            label="Max graph depth"
            description="How many hops to follow in the memory graph"
            value={maxGraphDepth}
            onChange={setMaxGraphDepth}
            min={0}
            max={5}
            step={1}
            format={(n) => `${n}`}
          />
        </div>
      </section>
    </div>
  );
}

function ModelDropdown({
  models,
  value,
  onChange,
  placeholder,
}: {
  models: { id: string; name: string; contextWindow?: number; size?: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const current = models.find((m) => m.id === value);

  useClickOutside(ref, open, () => setOpen(false));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q));
  }, [models, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-[12px] transition-colors hover:border-[var(--color-border-strong)]"
      >
        <div className="grid size-5 shrink-0 place-items-center rounded bg-indigo-500/20 text-indigo-300">
          <ModelIcon modelId={current?.id ?? ""} className="size-full" />
        </div>
        <span className="min-w-0 flex-1 truncate text-left text-white">
          {current?.name ?? placeholder}
        </span>
        <ChevronDown className={`size-3 shrink-0 text-[var(--color-text-dim)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl shadow-black/50">
          {models.length > 4 && (
            <div className="border-b border-[var(--color-border)] p-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full rounded-md bg-[var(--color-bg)] px-2 py-1.5 text-[12px] placeholder:text-[var(--color-text-dim)] focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
                !value
                  ? "bg-[var(--color-accent-soft)] text-white"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <span className="truncate">{placeholder}</span>
            </button>
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
                  m.id === value
                    ? "bg-[var(--color-accent-soft)] text-white"
                    : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className="truncate">{m.name}</span>
                {m.contextWindow && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--color-text-dim)]">
                    {m.contextWindow >= 1000
                      ? `${(m.contextWindow / 1000).toFixed(m.contextWindow % 1000 ? 1 : 0)}K`
                      : m.contextWindow}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LimitControl({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
}) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[12.5px] font-medium text-white">{label}</div>
          <div className="text-[11px] text-[var(--color-text-dim)]">{description}</div>
        </div>
        <span className="shrink-0 rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-white">
          {format(value)}
        </span>
      </div>
      <div className="relative">
        <div className="h-1.5 rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-[var(--color-accent)]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
