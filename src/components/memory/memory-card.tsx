import { Pin, Tag } from "lucide-react";
import type { MemoryNode } from "@/lib/memory-types";
import { useMemoryUi } from "./memory-ui-context";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ImportanceDots({ value }: { value: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`importance ${value}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`size-1 rounded-full ${i <= value ? "bg-indigo-400" : "bg-white/10"}`}
        />
      ))}
    </span>
  );
}

function priorityClass(priority: MemoryNode["priority"]): string {
  if (priority === "permanent") return "border-white/20 bg-white/10 text-white";
  if (priority === "high") return "border-indigo-400/25 bg-indigo-400/10 text-indigo-200";
  if (priority === "low") return "border-slate-500/20 bg-slate-500/10 text-slate-400";
  if (priority === "ephemeral") return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  return "border-[var(--color-border)] bg-white/[0.02] text-[var(--color-text-dim)]";
}

export function MemoryCard({ node }: { node: MemoryNode }) {
  const { selectedNodeId, selectNode } = useMemoryUi();
  const active = selectedNodeId === node.id;

  return (
    <button
      type="button"
      onClick={() => selectNode(node.id)}
      className={`group relative flex w-full flex-col gap-1.5 rounded-xl border px-3.5 py-2.5 text-left transition-all ${
        active
          ? "border-indigo-400/40 bg-[var(--color-accent-soft)] shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
          : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-[var(--color-border-strong)] hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-white">{node.title}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {node.isPinned && <Pin className="size-3 text-indigo-300" />}
          <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${priorityClass(node.priority)}`}>
            {node.priority}
          </span>
          <ImportanceDots value={node.importance} />
        </span>
      </div>
      {node.summary && (
        <p className="line-clamp-2 text-[11.5px] leading-snug text-[var(--color-text-dim)]">
          {node.summary}
        </p>
      )}
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-[var(--color-border)] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-[var(--color-text-dim)]">
            {node.type}
          </span>
          {node.tags.slice(0, 3).map((t) => (
            <span key={t} className="flex items-center gap-0.5 text-[10px] text-[var(--color-text-dim)]">
              <Tag className="size-2.5" />
              {t}
            </span>
          ))}
          {node.tags.length > 3 && (
            <span className="text-[10px] text-[var(--color-text-dim)]">+{node.tags.length - 3}</span>
          )}
        </div>
        <span className="font-mono text-[10px] text-[var(--color-text-dim)]">
          {relativeTime(node.updatedAt)}
        </span>
      </div>
    </button>
  );
}
