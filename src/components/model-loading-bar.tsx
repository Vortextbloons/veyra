import { Loader2 } from "lucide-react";
import type { ModelLoadProgress } from "@/modules/chat/chat-types";

const PHASE_LABEL: Record<string, string> = {
  unloading: "Unloading previous model",
  loading: "Loading model",
  ready: "Model ready",
};

const INDETERMINATE_STYLE = `
  @keyframes veyra-indeterminate {
    0% { width: 0%; margin-left: 0; }
    50% { width: 60%; margin-left: 20%; }
    100% { width: 0%; margin-left: 100%; }
  }
`;

export function ModelLoadingBar({ progress }: { progress: ModelLoadProgress }) {
  if (!progress || progress.phase === "ready") return null;

  const label = PHASE_LABEL[progress.phase] ?? "Loading model";
  const hasPercent = progress.percent != null && progress.percent >= 0;

  return (
    <div className="flex items-center gap-2.5 px-1 pb-1">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--color-accent)]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-medium text-[var(--color-accent)]">
            {label}
          </span>
          {hasPercent && (
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-accent)]/60">
              {progress.percent}%
            </span>
          )}
        </div>
        <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-[var(--color-accent-soft)]">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300 ease-out"
            style={{
              width: hasPercent ? `${Math.min(100, Math.max(0, progress.percent ?? 0))}%` : "100%",
              animation: hasPercent ? undefined : "veyra-indeterminate 1.5s ease-in-out infinite",
            }}
          />
        </div>
      </div>
      {!hasPercent && <style>{INDETERMINATE_STYLE}</style>}
    </div>
  );
}
