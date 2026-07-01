import { useMemo, useState } from "react";
import {
  Brain,
  Search,
  BookOpen,
  ScanLine,
  ShieldCheck,
  FileText,
  AlertCircle,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import type { ResearchStep, ResearchStepStatus, ResearchStepType } from "../research-types";

const STEP_ICONS: Record<ResearchStepType, React.ReactNode> = {
  clarify: <Brain className="size-3.5" />,
  plan: <Brain className="size-3.5" />,
  background: <Search className="size-3.5" />,
  search: <Search className="size-3.5" />,
  read: <BookOpen className="size-3.5" />,
  extract: <ScanLine className="size-3.5" />,
  verify: <ShieldCheck className="size-3.5" />,
  synthesize: <FileText className="size-3.5" />,
  report: <FileText className="size-3.5" />,
  follow_up: <Brain className="size-3.5" />,
};

const STEP_COLORS: Record<ResearchStepStatus, string> = {
  pending: "bg-[var(--color-text-dim)]/20 text-[var(--color-text-dim)] border-[var(--color-text-dim)]/10",
  running: "bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  skipped: "bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]/60 border-[var(--color-text-dim)]/10",
};

const STATUS_ICONS: Record<ResearchStepStatus, React.ReactNode> = {
  pending: <CircleDashed className="size-3" />,
  running: <CircleDashed className="size-3 animate-spin" />,
  completed: <CheckCircle2 className="size-3" />,
  failed: <AlertCircle className="size-3" />,
  skipped: <CircleDashed className="size-3" />,
};

type Props = {
  steps: ResearchStep[];
};

export function ResearchRunTimeline({ steps }: Props) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...steps].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [steps],
  );

  return (
    <div className="flex flex-col gap-0 p-4">
      {sorted.map((step, index) => {
        const isLast = index === sorted.length - 1;
        const isExpanded = expandedStepId === step.id;
        const hasDetail = Boolean(step.detail || step.output || step.error);

        return (
          <div key={step.id} className="flex gap-3">
            {/* Node + connector line */}
            <div className="flex flex-col items-center">
              <div
                className={`grid size-8 shrink-0 place-items-center rounded-full border ${STEP_COLORS[step.status]}`}
                title={step.status}
              >
                {STEP_ICONS[step.type]}
              </div>
              {!isLast && (
                <div className="mt-1 w-px flex-1 bg-[var(--color-border)]" />
              )}
            </div>

            {/* Step content */}
            <div className={`flex-1 pb-5 ${isLast ? "" : ""}`}>
              <button
                type="button"
                onClick={() => hasDetail && setExpandedStepId(isExpanded ? null : step.id)}
                className={`flex w-full flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                  isExpanded
                    ? "border-[var(--color-border)] bg-white/[0.03]"
                    : "border-transparent bg-transparent hover:bg-white/[0.02]"
                } ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--color-text)]">
                      {step.title}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
                      {STATUS_ICONS[step.status]}
                      {step.status}
                    </span>
                  </div>
                  {step.tokensUsed !== undefined && step.tokensUsed > 0 && (
                    <span className="text-[10px] font-mono text-[var(--color-text-dim)]">
                      {step.tokensUsed.toLocaleString()} tokens
                    </span>
                  )}
                </div>

                {step.detail && (
                  <p className="text-[12px] text-[var(--color-text-dim)]">{step.detail}</p>
                )}

                {step.error && (
                  <p className="text-[12px] text-red-300">{step.error}</p>
                )}

                {isExpanded && step.output && (
                  <div className="mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
                    <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
                      {step.output}
                    </p>
                  </div>
                )}
              </button>
            </div>
          </div>
        );
      })}

      {sorted.length === 0 && (
        <div className="flex items-center justify-center py-12 text-[12.5px] text-[var(--color-text-dim)]">
          No steps recorded yet.
        </div>
      )}
    </div>
  );
}
