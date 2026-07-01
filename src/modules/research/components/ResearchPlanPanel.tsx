import { useState } from "react";
import { Pencil, X, Save } from "lucide-react";
import type { ResearchPlan, ResearchPlanStep } from "../research-types";
import { useResearchStore } from "../research-store";

type Props = {
  plan: ResearchPlan;
  runId: string;
};

export function ResearchPlanPanel({ plan, runId }: Props) {
  const updateRun = useResearchStore((s) => s.updateRun);
  const [isEditing, setIsEditing] = useState(false);
  const [editJson, setEditJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const handleStartEdit = () => {
    setEditJson(JSON.stringify(plan, null, 2));
    setParseError(null);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    setParseError(null);
    try {
      const parsed = JSON.parse(editJson) as ResearchPlan;
      if (!Array.isArray(parsed.steps)) {
        throw new Error("Plan must have a 'steps' array");
      }
      if (parsed.steps.length === 0) {
        throw new Error("Plan must include at least one step");
      }
      parsed.steps.forEach((step: Partial<ResearchPlanStep>, index) => {
        if (!step.title || !step.description) {
          throw new Error(`Step ${index + 1} must include title and description`);
        }
        if (!Array.isArray(step.searchQueries) || step.searchQueries.some((q) => typeof q !== "string" || q.trim().length === 0)) {
          throw new Error(`Step ${index + 1} must include non-empty search queries`);
        }
      });
      await updateRun({
        id: runId,
        plan: { ...parsed, userEdited: true, runId },
      });
      setIsEditing(false);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setParseError(null);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">
          Research Plan
        </h2>

        {!isEditing && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] text-[var(--color-text)] transition-colors hover:bg-white/[0.03]"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
          </div>
        )}

        {isEditing && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSaveEdit}
              className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110"
            >
              <Save className="size-3.5" />
              Save
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
            >
              <X className="size-3.5" />
              Cancel
            </button>
          </div>
        )}
      </div>

      {parseError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {parseError}
        </div>
      )}

      {isEditing ? (
        <textarea
          value={editJson}
          onChange={(e) => setEditJson(e.target.value)}
          rows={20}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-[12px] leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {plan.steps.map((step) => (
            <PlanStepCard key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanStepCard({ step }: { step: ResearchPlanStep }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
      <div className="flex items-start gap-3">
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-[12px] font-semibold">
          {step.stepNumber}
        </div>
        <div className="flex-1">
          <h3 className="text-[13px] font-medium text-[var(--color-text)]">{step.title}</h3>
          <p className="mt-0.5 text-[12px] text-[var(--color-text-dim)]">{step.description}</p>

          {step.searchQueries && step.searchQueries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {step.searchQueries.map((q, i) => (
                <span
                  key={i}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[11px] text-[var(--color-text-dim)]"
                >
                  {q}
                </span>
              ))}
            </div>
          )}

          {step.expectedSources !== undefined && step.expectedSources > 0 && (
            <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
              Expected sources: {step.expectedSources}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
