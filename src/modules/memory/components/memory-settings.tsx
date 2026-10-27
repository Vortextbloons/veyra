import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Bot,
  Brain,
  CircleAlert,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Toggle } from "@/components/toggle";
import { ConfirmDangerModal } from "@/components/confirm-danger-modal";
import { useProjectStore } from "@/modules/projects/project-store";
import type { MemoryRecord } from "@/modules/memory/memory-types";
import { useMemoryStore } from "@/modules/memory/memory-store";
import {
  MAX_MEMORY_FACT_LENGTH,
  MEMORY_SCOPE_ALL,
  MEMORY_SCOPE_PERSONAL,
  countMemoriesByScope,
  filterMemories,
  formatMemoryTimestamp,
  groupMemoriesByScope,
  memoryProvenance,
  projectScopeFilter,
  runMemoryRetry,
  shortIdentifier,
  sortMemoriesByNewest,
  wasMemoryEdited,
  type MemoryScopeFilter,
} from "./memory-view-model";

function describeError(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return fallback;
}

function Dot() {
  return (
    <span aria-hidden className="text-[var(--color-text-dim)]/40">
      ·
    </span>
  );
}

type MemoryFactRowProps = {
  record: MemoryRecord;
  railClass: string;
  onSave: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function MemoryFactRow({ record, railClass, onSave, onDelete }: MemoryFactRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(record.text);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!editing) return;
    const node = editRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [editing]);

  // Keep an open editor from silently showing a stale value after a background refresh:
  // `startEditing` always re-seeds the draft from the current record.
  const startEditing = () => {
    setDraft(record.text);
    setRowError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setRowError(null);
  };

  const save = async () => {
    const next = draft.trim();
    if (!next) {
      setRowError("Write at least a few words before saving.");
      return;
    }
    if (next === record.text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setRowError(null);
    try {
      await onSave(record.id, next);
      setEditing(false);
    } catch (cause) {
      setRowError(describeError(cause, "Could not update this fact."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setRowError(null);
    try {
      await onDelete(record.id);
    } catch (cause) {
      setRowError(describeError(cause, "Could not delete this fact."));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const provenance = memoryProvenance(record);
  const SourceIcon =
    record.sourceId === "manual" ? Pencil : record.sourceType === "agent" ? Bot : MessageSquare;
  const edited = wasMemoryEdited(record);
  const preview = record.text.slice(0, 60);

  return (
    <li className="flex gap-3 px-4 py-3.5">
      <span aria-hidden className={`w-[2px] shrink-0 self-stretch rounded-full ${railClass}`} />

      <div className="min-w-0 flex-1">
        {editing ? (
          <div>
            <label htmlFor={inputId} className="sr-only">
              Edit saved fact
            </label>
            <textarea
              id={inputId}
              ref={editRef}
              value={draft}
              rows={3}
              maxLength={MAX_MEMORY_FACT_LENGTH}
              aria-invalid={rowError ? true : undefined}
              aria-describedby={rowError ? errorId : undefined}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEditing();
                }
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void save();
                }
              }}
              className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] leading-relaxed text-white focus:border-[var(--color-accent)]/50 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto font-mono text-[10px] text-[var(--color-text-dim)]">
                {draft.length}/{MAX_MEMORY_FACT_LENGTH}
              </span>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="rounded-md px-2.5 py-1 text-[11.5px] text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !draft.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11.5px] font-medium text-white transition-colors hover:brightness-110 disabled:opacity-40"
              >
                {saving && <Loader2 aria-hidden className="size-3 animate-spin" />}
                {saving ? "Saving" : "Save fact"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white">
              {record.text}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[10.5px] leading-none text-[var(--color-text-dim)]">
              <span className="inline-flex items-center gap-1">
                <SourceIcon aria-hidden className="size-3" />
                {provenance.label}
              </span>
              {provenance.showIdentifiers && (
                <>
                  <Dot />
                  <span title={`Source id: ${record.sourceId}`}>
                    {shortIdentifier(record.sourceId)}
                  </span>
                  <Dot />
                  <span title={`Turn: ${record.turnId}`}>
                    turn {shortIdentifier(record.turnId)}
                  </span>
                </>
              )}
              <Dot />
              <time dateTime={new Date(record.createdAt).toISOString()}>
                saved {formatMemoryTimestamp(record.createdAt)}
              </time>
              {edited && (
                <>
                  <Dot />
                  <span title={`Edited ${formatMemoryTimestamp(record.updatedAt)}`}>edited</span>
                </>
              )}
            </div>
          </>
        )}

        {rowError && (
          <p id={errorId} role="alert" className="mt-2 text-[11px] text-rose-300">
            {rowError}
          </p>
        )}
      </div>

      {!editing && (
        <div className="flex shrink-0 items-start gap-0.5">
          {confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={deleting}
                className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-1 text-[10.5px] font-medium text-rose-200 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
              >
                {deleting && <Loader2 aria-hidden className="size-3 animate-spin" />}
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                aria-label="Keep this fact"
                className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startEditing}
                aria-label={`Edit fact: ${preview}`}
                title="Edit fact"
                className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
              >
                <Pencil aria-hidden className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label={`Delete fact: ${preview}`}
                title="Delete fact"
                className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function MemorySettings() {
  const enabled = useMemoryStore((s) => s.enabled);
  const setEnabled = useMemoryStore((s) => s.setEnabled);
  const records = useMemoryStore((s) => s.records);
  const loading = useMemoryStore((s) => s.loading);
  const storeError = useMemoryStore((s) => s.error);
  const initialize = useMemoryStore((s) => s.initialize);
  const retrySave = useMemoryStore((s) => s.retrySave);
  const addMemory = useMemoryStore((s) => s.addMemory);
  const updateMemory = useMemoryStore((s) => s.updateMemory);
  const deleteMemory = useMemoryStore((s) => s.deleteMemory);
  const clearMemories = useMemoryStore((s) => s.clearMemories);

  const projects = useProjectStore((s) => s.projects);
  const hydrateProjects = useProjectStore((s) => s.hydrateProjects);

  const [filter, setFilter] = useState<MemoryScopeFilter>(MEMORY_SCOPE_ALL);
  const [query, setQuery] = useState("");
  const [composerText, setComposerText] = useState("");
  const [composerScope, setComposerScope] = useState<string>(MEMORY_SCOPE_PERSONAL);
  const [adding, setAdding] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [clearScope, setClearScope] = useState<string>(MEMORY_SCOPE_ALL);
  const [clearOpen, setClearOpen] = useState(false);
  const initializedRef = useRef(false);

  // The store reports load failures through `error` and rethrows; the UI surfaces both,
  // so the rejection must be swallowed here to avoid an unhandled promise rejection.
  const runInitialize = useCallback(() => {
    void initialize().catch(() => undefined);
  }, [initialize]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    runInitialize();
  }, [runInitialize]);

  useEffect(() => {
    void hydrateProjects();
  }, [hydrateProjects]);

  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(""), 5000);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const projectName = useCallback(
    (id: string) => projectById.get(id)?.name ?? `Project ${shortIdentifier(id)}`,
    [projectById],
  );

  const sortedRecords = useMemo(() => sortMemoriesByNewest(records), [records]);
  const counts = useMemo(() => countMemoriesByScope(sortedRecords), [sortedRecords]);

  const addableProjects = useMemo(
    () =>
      projects
        .filter((project) => project.status !== "archived")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const filterChips = useMemo(() => {
    const chips: Array<{ key: MemoryScopeFilter; label: string; count: number }> = [
      { key: MEMORY_SCOPE_ALL, label: "All", count: counts.total },
      { key: MEMORY_SCOPE_PERSONAL, label: "Personal", count: counts.personal },
    ];
    for (const projectId of [...counts.byProject.keys()].sort((a, b) =>
      projectName(a).localeCompare(projectName(b)),
    )) {
      chips.push({
        key: projectScopeFilter(projectId),
        label: projectName(projectId),
        count: counts.byProject.get(projectId) ?? 0,
      });
    }
    return chips;
  }, [counts, projectName]);

  const visibleRecords = useMemo(
    () => filterMemories(sortedRecords, { filter, query, projectName }),
    [sortedRecords, filter, query, projectName],
  );

  const groups = useMemo(
    () => groupMemoriesByScope(visibleRecords, (id) => projectById.get(id)),
    [visibleRecords, projectById],
  );

  const clearTargets = useMemo(() => {
    const options = [
      {
        value: MEMORY_SCOPE_ALL,
        label:
          counts.total === 0
            ? "All memories (0)"
            : `All memories (${counts.total})`,
      },
    ];
    for (const [projectId, count] of [...counts.byProject.entries()].sort((a, b) =>
      projectName(a[0]).localeCompare(projectName(b[0])),
    )) {
      options.push({ value: projectId, label: `${projectName(projectId)} (${count})` });
    }
    return options;
  }, [counts, projectName]);

  const effectiveClearScope =
    clearScope !== MEMORY_SCOPE_ALL && !counts.byProject.has(clearScope)
      ? MEMORY_SCOPE_ALL
      : clearScope;
  const clearCount =
    effectiveClearScope === MEMORY_SCOPE_ALL
      ? counts.total
      : counts.byProject.get(effectiveClearScope) ?? 0;
  const clearScopeLabel =
    effectiveClearScope === MEMORY_SCOPE_ALL
      ? "all saved memories"
      : `“${projectName(effectiveClearScope)}”`;

  const handleToggle = async (next: boolean) => {
    if (toggling) return;
    setToggling(true);
    setActionError(null);
    try {
      // The store persists the switch before resolving, so wait for the write
      // instead of reporting a success the encrypted file never saw.
      await setEnabled(next);
      const applied = useMemoryStore.getState().enabled;
      if (applied !== next) {
        setActionError(
          next
            ? "Memory stays off because the setting could not be written to encrypted storage."
            : "Memory is off for this session, but the setting could not be written to encrypted storage. It may be on again after restart.",
        );
        return;
      }
      setAnnouncement(
        applied
          ? "Memory on. Facts are recalled before turns and collected after them."
          : "Memory off. Facts are no longer recalled or collected automatically.",
      );
    } catch (cause) {
      // A failed disable still leaves memory off in this session, which is the
      // safe direction; say so instead of implying the switch did nothing.
      setActionError(
        next
          ? describeError(cause, "Memory could not be turned on because encrypted storage could not be saved.")
          : "Memory is off for this session, but the change could not be saved. It may be on again after restart.",
      );
    } finally {
      setToggling(false);
    }
  };

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    setActionError(null);
    try {
      const outcome = await runMemoryRetry({
        initialize,
        retrySave,
        readError: () => useMemoryStore.getState().error,
      });
      // Storage repairing a failed enable does not re-apply the intent, so never
      // imply memory came back on when the store still reports it off.
      setAnnouncement(
        useMemoryStore.getState().enabled
          ? "Memory storage is healthy and memory is on."
          : outcome === "saved"
            ? "Memory storage saved. Memory stays off until you switch it on."
            : "Memory storage reloaded.",
      );
    } catch (cause) {
      setActionError(describeError(cause, "Memory storage is still unavailable."));
    } finally {
      setRetrying(false);
    }
  };

  const handleAdd = async () => {
    const text = composerText.trim();
    if (!text) return;
    setAdding(true);
    setActionError(null);
    try {
      await addMemory(text, composerScope === MEMORY_SCOPE_PERSONAL ? undefined : composerScope);
      setComposerText("");
      setAnnouncement(
        enabled ? "Fact added to memory." : "Fact saved. Automatic recall stays off while memory is off.",
      );
    } catch (cause) {
      setActionError(describeError(cause, "Could not save this fact."));
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (id: string, text: string) => {
    await updateMemory(id, text);
    setAnnouncement("Fact updated.");
  };

  const handleDelete = async (id: string) => {
    await deleteMemory(id);
    setAnnouncement("Fact removed.");
  };

  const handleClear = async () => {
    setActionError(null);
    try {
      await clearMemories(
        effectiveClearScope === MEMORY_SCOPE_ALL ? undefined : effectiveClearScope,
      );
      setClearOpen(false);
      setAnnouncement(
        `Removed ${clearCount} ${clearCount === 1 ? "fact" : "facts"} from ${clearScopeLabel}.`,
      );
    } catch (cause) {
      setActionError(describeError(cause, "Could not remove these memories."));
      setClearOpen(false);
    }
  };

  const composerScopeOptions = [
    { value: MEMORY_SCOPE_PERSONAL, label: "Personal — every chat and agent run" },
    ...addableProjects.map((project) => ({
      value: project.id,
      label: `${project.name} — this project only`,
    })),
  ];

  const scopeCountLabel = `${counts.byProject.size} ${
    counts.byProject.size === 1 ? "project" : "projects"
  }`;
  const filteredOut = visibleRecords.length === 0 && sortedRecords.length > 0;

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 text-[var(--color-focus)]">
            <Brain aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold text-white">Memory</h2>
            <p className="mt-1 max-w-xl text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
              Durable facts Veyra carries between conversations. One switch covers automatic recall
              and collection in every chat and agent run.
            </p>
          </div>
          <Toggle
            on={enabled}
            onChange={(next) => void handleToggle(next)}
            ariaLabel="Memory"
            disabled={loading || toggling}
          />
        </div>

        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <p
            className={`text-[11.5px] leading-relaxed ${
              enabled ? "text-emerald-200/90" : "text-[var(--color-text-dim)]"
            }`}
          >
            {toggling
              ? "Saving the memory setting…"
              : enabled
                ? "On — personal facts and this project's facts are matched before each turn, and durable facts are extracted after a turn completes."
                : "Off — no automatic recall and no automatic collection. Facts already saved stay encrypted on this device, and you can still add, edit, or remove them below."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[var(--color-text-dim)]">
            <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5">
              {counts.total} {counts.total === 1 ? "fact" : "facts"}
            </span>
            <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5">
              {counts.personal} personal
            </span>
            <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5">
              {scopeCountLabel}
            </span>
            <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5">
              encrypted on this device
            </span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          How it works
        </h3>
        <dl className="grid gap-px overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2">
          <div className="bg-[var(--color-panel)] px-3.5 py-3">
            <dt className="text-[12px] font-medium text-white">Before a turn</dt>
            <dd className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
              Your message is matched against saved facts with local keyword search on this device.
              Matching personal facts and the current project's facts are added to the request, so
              the provider you selected receives them. Wording matters — this is not a semantic
              model.
            </dd>
          </div>
          <div className="bg-[var(--color-panel)] px-3.5 py-3">
            <dt className="text-[12px] font-medium text-white">After a turn</dt>
            <dd className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
              Once a chat or agent turn completes, the same provider and model you used for that
              turn distills durable facts in the background. With a cloud provider, that turn's user
              message is sent to that provider to extract facts; with LM Studio it stays on your
              machine. Reasoning traces and assistant output are not saved as memory.
            </dd>
          </div>
          <div className="bg-[var(--color-panel)] px-3.5 py-3">
            <dt className="text-[12px] font-medium text-white">Where facts live</dt>
            <dd className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
              Facts are stored and searched only on this device, inside the same encrypted file
              family as your conversations. There is no separate memory service or account — Veyra
              implements this itself, so no Mem0 cloud service is involved.
            </dd>
          </div>
          <div className="bg-[var(--color-panel)] px-3.5 py-3">
            <dt className="text-[12px] font-medium text-white">What is filtered</dt>
            <dd className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
              Only short, standalone facts are accepted, and text that looks like credentials, code,
              or raw logs is rejected automatically. That filtering reduces risk; it cannot
              guarantee nothing sensitive slips through, so review the list and remove anything you
              do not want kept.
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            Saved facts
          </h3>
          {!enabled && records.length > 0 && (
            <span className="text-[10.5px] text-[var(--color-text-dim)]">
              Memory off — these facts are not used automatically
            </span>
          )}
        </div>

        {storeError && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2.5 rounded-lg border border-rose-400/25 bg-rose-500/[0.06] px-3.5 py-2.5"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-rose-300" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-medium text-rose-100">Memory storage problem</p>
              <p className="mt-0.5 break-words text-[11px] leading-relaxed text-rose-200/80">
                {storeError}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={retrying}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-rose-400/25 px-2.5 py-1 text-[11px] text-rose-100 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {retrying && <Loader2 aria-hidden className="size-3 animate-spin" />}
              {retrying ? "Retrying" : "Try again"}
            </button>
          </div>
        )}

        <form
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAdd();
          }}
        >
          <label htmlFor="memory-new-fact" className="block text-[12px] font-medium text-white">
            Add a fact
          </label>
          <p id="memory-new-fact-hint" className="mt-0.5 text-[11px] text-[var(--color-text-dim)]">
            One durable detail: a preference, a constraint, recurring context. Adding by hand works
            whether or not automatic memory is on; a saved fact is only recalled automatically while
            memory is on.
          </p>
          <textarea
            id="memory-new-fact"
            value={composerText}
            onChange={(event) => setComposerText(event.target.value)}
            rows={2}
            maxLength={MAX_MEMORY_FACT_LENGTH}
            aria-describedby="memory-new-fact-hint"
            placeholder="Prefers TypeScript strict mode and avoids default exports."
            className="mt-2 w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[12.5px] leading-relaxed text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)]/50 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <label htmlFor="memory-new-scope" className="text-[11px] text-[var(--color-text-dim)]">
                Scope
              </label>
              <select
                id="memory-new-scope"
                value={composerScope}
                onChange={(event) => setComposerScope(event.target.value)}
                className="max-w-[240px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[11px] text-white focus:border-[var(--color-accent)]/50 focus:outline-none"
              >
                {composerScopeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                className={`font-mono text-[10px] ${
                  composerText.length > MAX_MEMORY_FACT_LENGTH - 50
                    ? "text-amber-300"
                    : "text-[var(--color-text-dim)]"
                }`}
              >
                {composerText.length}/{MAX_MEMORY_FACT_LENGTH}
              </span>
              <button
                type="submit"
                disabled={adding || !composerText.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {adding ? (
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                ) : (
                  <Plus aria-hidden className="size-3.5" />
                )}
                {adding ? "Adding" : "Add fact"}
              </button>
            </div>
          </div>
        </form>

        {actionError && (
          <p role="alert" className="mt-2 text-[11px] text-rose-300">
            {actionError}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter facts by scope">
            {filterChips.map((chip) => {
              const active = filter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(chip.key)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                    active
                      ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] font-medium text-white"
                      : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-dim)] hover:text-white"
                  }`}
                >
                  {chip.label}
                  <span className="ml-1.5 font-mono text-[10px] text-[var(--color-text-dim)]">
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative ml-auto w-full max-w-[220px]">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-dim)]"
            />
            <label htmlFor="memory-search" className="sr-only">
              Search saved facts
            </label>
            <input
              id="memory-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search facts…"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] py-1.5 pl-8 pr-2.5 text-[11.5px] text-white placeholder:text-[var(--color-text-dim)]/60 focus:border-[var(--color-accent)]/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-[var(--color-border)]">
          {loading ? (
            <div aria-busy="true" className="divide-y divide-[var(--color-border)]">
              <span className="sr-only">Loading saved facts</span>
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex animate-pulse gap-3 px-4 py-4">
                  <span aria-hidden className="h-10 w-[2px] shrink-0 rounded-full bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 rounded bg-white/5" />
                    <div className="h-2.5 w-1/2 rounded bg-white/[0.04]" />
                  </div>
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="px-5 py-9 text-center">
              <CircleAlert aria-hidden className="mx-auto size-5 text-[var(--color-text-dim)]/60" />
              <p className="mt-2 text-[12.5px] font-medium text-white">
                {filteredOut ? "No facts match this filter" : "No memories yet"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
                {filteredOut
                  ? "Try another scope or search term. Clearing the search shows everything."
                  : enabled
                    ? "Facts appear here after a chat or agent turn completes, or add one yourself above."
                    : "Add a fact above, or turn memory on to collect durable facts automatically after turns."}
              </p>
              {filteredOut && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter(MEMORY_SCOPE_ALL);
                    setQuery("");
                  }}
                  className="mt-2.5 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-text-dim)] transition-colors hover:text-white"
                >
                  Show all facts
                </button>
              )}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="border-b border-[var(--color-border)] last:border-b-0">
                <div className="flex items-baseline justify-between gap-3 bg-white/[0.02] px-4 py-2">
                  <div className="min-w-0">
                    <h4 className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                      {group.label}
                    </h4>
                    <p className="mt-0.5 truncate text-[10px] text-[var(--color-text-dim)]/70">
                      {group.description}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-dim)]">
                    {group.records.length}
                  </span>
                </div>
                <ul className="divide-y divide-[var(--color-border)]">
                  {group.records.map((record) => (
                    <MemoryFactRow
                      key={record.id}
                      record={record}
                      railClass={group.railClass}
                      onSave={handleUpdate}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-rose-400/20 bg-rose-500/[0.03] p-4">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-rose-200/80">
          Remove saved facts
        </h3>
        <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-[var(--color-text-dim)]">
          Removing facts deletes them from the encrypted memory files Veyra keeps on this device,
          including its own backup copy, so they are not restored on restart. Conversations,
          projects, and chat summaries are not affected. Personal facts are removed one at a time
          from the list above.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="memory-clear-scope" className="sr-only">
            Choose what to remove
          </label>
          <select
            id="memory-clear-scope"
            value={effectiveClearScope}
            onChange={(event) => setClearScope(event.target.value)}
            disabled={counts.total === 0}
            className="max-w-[260px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[11.5px] text-white focus:border-rose-400/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {clearTargets.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setClearOpen(true)}
            disabled={clearCount === 0}
            className="rounded-md border border-rose-400/30 px-3 py-1.5 text-[11.5px] font-medium text-rose-200 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Remove…
          </button>
        </div>
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <ConfirmDangerModal
        open={clearOpen}
        title={`Remove ${clearCount} saved ${clearCount === 1 ? "fact" : "facts"}?`}
        description={`This removes ${clearCount} ${
          clearCount === 1 ? "fact" : "facts"
        } from ${clearScopeLabel}, including Veyra's backup copy of the memory file. Your conversations and projects stay untouched.`}
        confirmLabel={`Remove ${clearCount} ${clearCount === 1 ? "fact" : "facts"}`}
        onCancel={() => setClearOpen(false)}
        onConfirm={handleClear}
      />
    </div>
  );
}
