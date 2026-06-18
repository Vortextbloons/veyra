import { useMemo } from "react";
import type { MemoryNode } from "@/modules/memory/memory-types";

type GraphPoint = {
  node: MemoryNode;
  x: number;
  y: number;
  radius: number;
  color: string;
  opacity: number;
};

type Props = {
  nodes: MemoryNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
};

const WIDTH = 900;
const HEIGHT = 620;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

function priorityRank(node: MemoryNode): number {
  if (node.isPinned || node.priority === "permanent" || node.importance >= 5) return 0;
  if (node.priority === "high" || node.importance >= 4) return 1;
  if (node.priority === "medium" || node.importance >= 3) return 2;
  if (node.priority === "low" || node.importance >= 2) return 3;
  return 4;
}

function nodeColor(node: MemoryNode): string {
  if (node.status === "needs_review") return "#f59e0b";
  if (node.contradictionOf) return "#ef4444";
  if (node.isPinned || node.priority === "permanent") return "#f8fafc";
  if (node.scope === "project") return "#38bdf8";
  if (node.type === "preference" || node.type === "instruction") return "#a78bfa";
  if (node.priority === "low" || node.priority === "ephemeral") return "#64748b";
  return "#818cf8";
}

function buildPoints(nodes: MemoryNode[]): GraphPoint[] {
  const sorted = nodes.slice().sort((a, b) => {
    const rank = priorityRank(a) - priorityRank(b);
    if (rank !== 0) return rank;
    if (a.importance !== b.importance) return b.importance - a.importance;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return sorted.map((node, index) => {
    const rank = priorityRank(node);
    const ring = [44, 112, 194, 268, 328][rank] ?? 328;
    const angle = index * 2.399963 + rank * 0.42;
    const wobble = ((index % 7) - 3) * 7;
    const radius = Math.max(5, 7 + node.importance * 1.8 + (node.isPinned ? 4 : 0));
    return {
      node,
      x: CENTER_X + Math.cos(angle) * (ring + wobble),
      y: CENTER_Y + Math.sin(angle) * (ring * 0.72 + wobble),
      radius,
      color: nodeColor(node),
      opacity: rank >= 3 ? 0.58 : 0.92,
    };
  });
}

export function MemoryGraph({ nodes, selectedNodeId, onSelectNode }: Props) {
  const points = useMemo(() => buildPoints(nodes), [nodes]);
  const selected = points.find((point) => point.node.id === selectedNodeId);

  return (
    <div className="relative min-h-[520px] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[#060812] shadow-inner">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(99,102,241,0.24),transparent_34%),radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]" />
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:44px_44px]" />

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="relative z-10 h-full min-h-[520px] w-full">
        <defs>
          <filter id="memory-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[44, 112, 194, 268, 328].map((ring, index) => (
          <ellipse
            key={ring}
            cx={CENTER_X}
            cy={CENTER_Y}
            rx={ring}
            ry={ring * 0.72}
            fill="none"
            stroke="rgba(148,163,184,0.11)"
            strokeDasharray={index > 2 ? "4 10" : "2 8"}
          />
        ))}

        {points.map((point) => {
          const target = points.find(
            (candidate) =>
              candidate.node.id === point.node.duplicateOf ||
              candidate.node.id === point.node.contradictionOf,
          );
          if (!target) return null;
          return (
            <line
              key={`${point.node.id}-${target.node.id}`}
              x1={point.x}
              y1={point.y}
              x2={target.x}
              y2={target.y}
              stroke={point.node.contradictionOf ? "rgba(239,68,68,0.55)" : "rgba(148,163,184,0.24)"}
              strokeWidth={point.node.contradictionOf ? 2 : 1}
              strokeDasharray="5 7"
            />
          );
        })}

        <circle cx={CENTER_X} cy={CENTER_Y} r="18" fill="rgba(248,250,252,0.95)" filter="url(#memory-glow)" />
        <text x={CENTER_X} y={CENTER_Y + 38} textAnchor="middle" className="fill-slate-200 text-[12px] font-semibold">
          Core Memory
        </text>

        {points.map((point) => {
          const active = point.node.id === selectedNodeId;
          return (
            <g
              key={point.node.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectNode(point.node.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelectNode(point.node.id);
              }}
              className="cursor-pointer outline-none"
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={point.radius + (active ? 7 : 0)}
                fill="none"
                stroke={active ? "rgba(255,255,255,0.8)" : point.color}
                strokeWidth={active ? 2 : 1}
                opacity={active ? 0.95 : 0.32}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={point.radius}
                fill={point.color}
                opacity={point.opacity}
                filter={active || point.node.isPinned ? "url(#memory-glow)" : undefined}
              />
              {point.node.status === "needs_review" && (
                <circle cx={point.x} cy={point.y} r={point.radius + 11} fill="none" stroke="rgba(245,158,11,0.7)" strokeDasharray="3 6" />
              )}
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-xl border border-white/10 bg-black/30 px-3 py-2 backdrop-blur-md">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">Constellation</div>
        <div className="mt-1 text-[12px] text-slate-200">Permanent memories orbit closest. Low priority memories fade outward.</div>
      </div>

      {selected && (
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-20 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
          <div className="text-[12.5px] font-semibold text-white">{selected.node.title}</div>
          <div className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-slate-300">{selected.node.summary || selected.node.content}</div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            {selected.node.priority} / {selected.node.scope} / confidence {Math.round(selected.node.confidence * 100)}%
          </div>
        </div>
      )}
    </div>
  );
}
