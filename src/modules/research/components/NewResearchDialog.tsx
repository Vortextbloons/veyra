import { useState, useEffect } from "react";
import {
  X,
  FlaskConical,
  Loader2,
  Zap,
  Target,
  Telescope,
  Infinity as InfinityIcon,
} from "lucide-react";
import { useProviderStore } from "@/stores/provider-store";
import { useResearchStore } from "../research-store";
import { aiScheduler } from "@/lib/ai-scheduler";
import { executeResearchRun } from "../research-runtime";
import type { ResearchDepth } from "../research-types";

const DEPTH_OPTIONS: {
  value: ResearchDepth;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "quick",
    label: "Quick",
    description: "1 search round, up to 5 sources",
    icon: <Zap className="size-4" />,
  },
  {
    value: "standard",
    label: "Standard",
    description: "2 rounds, up to 10 sources, verify",
    icon: <Target className="size-4" />,
  },
  {
    value: "deep",
    label: "Deep",
    description: "3 rounds, up to 20 sources, verify",
    icon: <Telescope className="size-4" />,
  },
  {
    value: "exhaustive",
    label: "Exhaustive",
    description: "4 rounds, up to 30 sources, verify + follow-up",
    icon: <InfinityIcon className="size-4" />,
  },
];

const DEPTH_BADGE: Record<ResearchDepth, string> = {
  quick: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  standard: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  deep: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  exhaustive: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

type Props = {
  onClose: () => void;
};

export function NewResearchDialog({ onClose }: Props) {
  const [question, setQuestion] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>("standard");
  const [isStarting, setIsStarting] = useState(false);

  const createRun = useResearchStore((s) => s.createRun);
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);
  const selectedModel = useProviderStore((s) => s.selectedModel);
  const selectedProvider = useProviderStore((s) => s.selectedProvider);
  const setSelectedModel = useProviderStore((s) => s.setSelectedModel);

  const canStart = question.trim().length > 0 && !isStarting;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleStart = async () => {
    if (!canStart) return;
    setIsStarting(true);
    try {
      const run = await createRun({
        question: question.trim(),
        depth,
        modelUsed: selectedModel,
        providerId: selectedProvider,
      });

      aiScheduler.enqueueAiJob({
        type: "research_run",
        priority: 0,
        title: `Research: ${run.question}`,
        description:
          run.question.length > 80
            ? run.question.slice(0, 80) + "..."
            : run.question,
        run: async (signal) => {
          await executeResearchRun(run, signal, () => {
            // Store is already updated inside executeResearchRun
          });
        },
      });

      onClose();
    } catch (err) {
      console.error("Failed to start research:", err);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <FlaskConical className="size-4" />
            </div>
            <h2 className="text-[15px] font-semibold text-[var(--color-text)]">
              New Research
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Question input */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
              Research question
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you want to research?"
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey && canStart) handleStart();
                if (e.key === "Escape") onClose();
              }}
            />
          </div>

          {/* Depth selector */}
          <div>
            <label className="mb-2 block text-[12px] font-medium text-[var(--color-text)]">
              Research depth
            </label>
            <div className="grid grid-cols-2 gap-2">
              {DEPTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDepth(opt.value)}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                    depth === opt.value
                      ? `border-[var(--color-accent)] bg-[var(--color-accent-soft)]`
                      : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-white/20"
                  }`}
                >
                  <div
                    className={`mt-0.5 ${
                      depth === opt.value
                        ? "text-[var(--color-accent)]"
                        : "text-[var(--color-text-dim)]"
                    }`}
                  >
                    {opt.icon}
                  </div>
                  <div className="flex-1">
                    <div
                      className={`flex items-center gap-1.5 text-[12px] font-medium ${
                        depth === opt.value ? "text-white" : "text-[var(--color-text)]"
                      }`}
                    >
                      {opt.label}
                      {depth === opt.value && (
                        <span
                          className={`rounded border px-1 py-px text-[9px] font-medium uppercase tracking-wide ${DEPTH_BADGE[opt.value]}`}
                        >
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-[var(--color-text-dim)]">
                      {opt.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
              Model
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="h-9 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {models.length === 0 && (
                  <option value="">No models available</option>
                )}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-[var(--color-text-dim)]">
                {providers.find((p) => p.id === selectedProvider)?.name ??
                  selectedProvider}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[12px] font-medium text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2 text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isStarting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <FlaskConical className="size-4" />
                Start Research
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
