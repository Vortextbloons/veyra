import { useMemo } from "react";
import { diffLines } from "diff";
import { Check, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineDiffPreviewProps {
  originalText: string;
  proposedText: string;
  explanation?: string;
  onAccept: () => void;
  onReject: () => void;
}

export function InlineDiffPreview({
  originalText,
  proposedText,
  explanation,
  onAccept,
  onReject,
}: InlineDiffPreviewProps) {
  const changes = useMemo(
    () => diffLines(originalText, proposedText),
    [originalText, proposedText],
  );

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const change of changes) {
      const lines = change.value.split("\n").filter(Boolean).length;
      if (change.added) added += lines;
      if (change.removed) removed += lines;
    }
    return { added, removed };
  }, [changes]);

  const diffLines_ = useMemo(() => {
    const result: Array<{ content: string; type: "same" | "added" | "removed" }> = [];
    for (const change of changes) {
      const content = change.value
        .split("\n")
        .filter((line, i, arr) => line !== "" || i < arr.length - 1);
      const type = change.added ? "added" : change.removed ? "removed" : "same";
      for (const line of content) {
        result.push({ content: line, type });
      }
    }
    return result;
  }, [changes]);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onReject}
    >
      <div
        className="mx-4 w-full max-w-[520px] overflow-hidden rounded-2xl border border-emerald-300/25 bg-[#08120f]/98 shadow-2xl shadow-emerald-950/50 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 bg-emerald-400/[0.08] px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-300" />
            <p className="text-[12px] font-semibold text-emerald-200/90">
              Proposed Edit
            </p>
            <span className="ml-auto text-[10px] text-emerald-400/60">
              +{stats.added} / -{stats.removed}
            </span>
          </div>
          {explanation && (
            <p className="mt-1.5 text-[11px] text-white/50">{explanation}</p>
          )}
        </div>

        <div className="max-h-[320px] overflow-y-auto font-mono text-[11px]">
          {diffLines_.map((line, i) => (
            <div
              key={i}
              className={cn(
                "min-h-[18px] px-4 py-0.5 whitespace-pre-wrap break-all",
                line.type === "added"
                  ? "bg-emerald-500/10 text-emerald-300"
                  : line.type === "removed"
                    ? "bg-red-500/10 text-red-400"
                    : "text-[var(--color-text-dim)]",
              )}
            >
              <span className="mr-2 inline-block w-3 text-right opacity-50">
                {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
              </span>
              {line.content}
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={onAccept}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-2 text-[12px] font-medium text-emerald-300 hover:bg-emerald-500/30 transition-colors"
          >
            <Check className="size-3.5" />
            Accept
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-2 text-[12px] font-medium text-red-400 hover:bg-red-500/25 transition-colors"
          >
            <X className="size-3.5" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
