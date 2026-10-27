import type { MemoryRecord } from "@/modules/memory/memory-types";

// ── Presentation helpers for the Memory settings screen ────────────────────
// Pure, side-effect free so the grouping and filtering rules can be tested
// without mounting React. No persistence or retrieval logic lives here.

export const MEMORY_SCOPE_ALL = "all";
export const MEMORY_SCOPE_PERSONAL = "personal";

/** Mirrors the encrypted store's per-fact limit so the UI can enforce it before saving. */
export const MAX_MEMORY_FACT_LENGTH = 500;

export const PERSONAL_SCOPE_RAIL = "bg-[var(--color-accent)]/80";

export const PROJECT_SCOPE_RAILS: Record<string, string> = {
  indigo: "bg-indigo-400/80",
  violet: "bg-violet-400/80",
  blue: "bg-blue-400/80",
  cyan: "bg-cyan-400/80",
  teal: "bg-teal-400/80",
  emerald: "bg-emerald-400/80",
  amber: "bg-amber-400/80",
  orange: "bg-orange-400/80",
  rose: "bg-rose-400/80",
  pink: "bg-pink-400/80",
  slate: "bg-slate-400/80",
};

const NEUTRAL_SCOPE_RAIL = "bg-[var(--color-border-strong)]";

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export type MemoryScopeFilter = "all" | "personal" | `project:${string}`;

export type MemoryScopeGroup = {
  key: string;
  label: string;
  description: string;
  railClass: string;
  records: MemoryRecord[];
};

export type MemoryProjectLookup = (projectId: string) => { name: string; color?: string } | undefined;

export function projectScopeFilter(projectId: string): MemoryScopeFilter {
  return `project:${projectId}`;
}

export function shortIdentifier(value: string): string {
  if (!value) return "unknown";
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export function formatMemoryTimestamp(value: number): string {
  if (!Number.isFinite(value)) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return TIMESTAMP_FORMAT.format(date);
}

/** True when the fact was edited after it was first saved. */
export function wasMemoryEdited(record: MemoryRecord): boolean {
  return record.updatedAt !== record.createdAt;
}

export type MemoryProvenance = {
  label: string;
  /** Manual edits have no conversation turn behind them, so ids would be noise. */
  showIdentifiers: boolean;
};

/** Manual manager rows are distinguishable from model-extracted facts. */
export function memoryProvenance(record: MemoryRecord): MemoryProvenance {
  if (record.sourceId === "manual") return { label: "Added by you", showIdentifiers: false };
  return {
    label: record.sourceType === "agent" ? "Agent run" : "Chat",
    showIdentifiers: true,
  };
}

export type MemoryRetryDeps = {
  initialize: () => Promise<void>;
  retrySave: () => Promise<void>;
  /** Current store failure, read after the reload attempt. */
  readError: () => string | null;
};

/**
 * One user-initiated retry. Reloading first covers read failures; a save is
 * only re-attempted when a problem survives that reload, so a healthy store is
 * never rewritten just because the button was pressed.
 */
export async function runMemoryRetry(deps: MemoryRetryDeps): Promise<"loaded" | "saved"> {
  await deps.initialize();
  if (!deps.readError()) return "loaded";
  await deps.retrySave();
  return "saved";
}

/** Newest first. Falls back to id ordering so equal timestamps stay stable. */
export function sortMemoriesByNewest(records: MemoryRecord[]): MemoryRecord[] {
  return [...records].sort((a, b) => {
    const byTime = b.createdAt - a.createdAt;
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

export function countMemoriesByScope(
  records: MemoryRecord[],
): { total: number; personal: number; byProject: Map<string, number> } {
  let personal = 0;
  const byProject = new Map<string, number>();
  for (const record of records) {
    if (record.projectId) {
      byProject.set(record.projectId, (byProject.get(record.projectId) ?? 0) + 1);
    } else {
      personal += 1;
    }
  }
  return { total: records.length, personal, byProject };
}

export function filterMemories(
  records: MemoryRecord[],
  options: { filter: MemoryScopeFilter; query: string; projectName: (id: string) => string },
): MemoryRecord[] {
  const needle = options.query.trim().toLowerCase();
  const filter = options.filter;

  return records.filter((record) => {
    if (filter === "personal" && record.projectId) return false;
    if (filter.startsWith("project:")) {
      if (record.projectId !== filter.slice("project:".length)) return false;
    }
    if (!needle) return true;

    const scopeLabel = record.projectId ? options.projectName(record.projectId) : "personal";
    return [record.text, record.sourceId, record.turnId, scopeLabel]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

/** Groups filtered records into personal first, then one section per project. */
export function groupMemoriesByScope(
  records: MemoryRecord[],
  lookup: MemoryProjectLookup,
): MemoryScopeGroup[] {
  const personal: MemoryRecord[] = [];
  const byProject = new Map<string, MemoryRecord[]>();

  for (const record of records) {
    if (!record.projectId) {
      personal.push(record);
      continue;
    }
    const rows = byProject.get(record.projectId) ?? [];
    rows.push(record);
    byProject.set(record.projectId, rows);
  }

  const nameOf = (projectId: string) => lookup(projectId)?.name ?? `Project ${shortIdentifier(projectId)}`;
  const groups: MemoryScopeGroup[] = [];

  if (personal.length > 0) {
    groups.push({
      key: MEMORY_SCOPE_PERSONAL,
      label: "Personal",
      description: "Recalled in every chat and agent run",
      railClass: PERSONAL_SCOPE_RAIL,
      records: personal,
    });
  }

  const projectEntries = [...byProject.entries()].sort((a, b) =>
    nameOf(a[0]).localeCompare(nameOf(b[0])),
  );

  for (const [projectId, rows] of projectEntries) {
    const project = lookup(projectId);
    const name = nameOf(projectId);
    groups.push({
      key: projectScopeFilter(projectId),
      label: name,
      description: `Recalled only inside ${name}`,
      railClass: (project?.color && PROJECT_SCOPE_RAILS[project.color]) || NEUTRAL_SCOPE_RAIL,
      records: rows,
    });
  }

  return groups;
}
