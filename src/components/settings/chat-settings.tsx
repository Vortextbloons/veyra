import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import { Toggle } from "@/components/toggle";
import { ChevronDown } from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import { ModelIcon } from "@/components/model-icon";

export function ChatSettings() {
  const autoNameEnabled = useSettingsStore((s) => s.autoNameEnabled);
  const setAutoNameEnabled = useSettingsStore((s) => s.setAutoNameEnabled);
  const autoNameModel = useSettingsStore((s) => s.autoNameModel);
  const setAutoNameModel = useSettingsStore((s) => s.setAutoNameModel);
  const backgroundJobsEnabled = useSettingsStore((s) => s.backgroundJobsEnabled);
  const setBackgroundJobsEnabled = useSettingsStore((s) => s.setBackgroundJobsEnabled);
  const autoSummarizeChats = useSettingsStore((s) => s.autoSummarizeChats);
  const setAutoSummarizeChats = useSettingsStore((s) => s.setAutoSummarizeChats);
  const summaryModel = useSettingsStore((s) => s.summaryModel);
  const setSummaryModel = useSettingsStore((s) => s.setSummaryModel);
  const contextAnchoringEnabled = useSettingsStore((s) => s.contextAnchoringEnabled);
  const setContextAnchoringEnabled = useSettingsStore((s) => s.setContextAnchoringEnabled);

  const models = useProviderStore((s) => s.models);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Background Jobs
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Run background jobs"
              on={backgroundJobsEnabled}
              onChange={setBackgroundJobsEnabled}
            />
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Required for auto-naming and auto-summarize. When off, those jobs will not run even if enabled below.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Auto-naming
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Enable auto-naming"
              on={autoNameEnabled}
              onChange={setAutoNameEnabled}
            />
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2">
              <div className="text-[12.5px] font-medium text-white">
                Auto-name model
              </div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Model used to generate titles. Leave empty to use the currently selected model.
              </div>
            </div>
            <ModelDropdown
              models={models}
              value={autoNameModel}
              onChange={setAutoNameModel}
              placeholder="Use selected model"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Summarization
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Auto-summarize chats"
              on={autoSummarizeChats}
              onChange={setAutoSummarizeChats}
            />
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2">
              <div className="text-[12.5px] font-medium text-white">
                Summary model
              </div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Model used to generate chat summaries. Leave empty to use the currently selected model.
              </div>
            </div>
            <ModelDropdown
              models={models}
              value={summaryModel}
              onChange={setSummaryModel}
              placeholder="Use selected model"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Context Anchoring
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Enable context anchoring"
              on={contextAnchoringEnabled}
              onChange={setContextAnchoringEnabled}
            />
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Provides the AI with the current date/time and platform on the first message of each chat to reduce hallucinated dates and times.
          </p>
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
        <ChevronDown
          className={`size-3 shrink-0 text-[var(--color-text-dim)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
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
