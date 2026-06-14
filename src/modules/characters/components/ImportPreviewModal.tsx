// ── Import preview modal ────────────────────────────────────────────────────
//
// Two-step flow:
//   1. Parse the source (CCv3 JSON or PNG) into a Veyra draft.
//   2. Show a 2-column diff (CCv3 field → Veyra field) with warnings and a
//      conflict resolver for duplicate names.

import { useMemo, useState } from "react";
import { X, AlertTriangle, Check, Save, Merge, Copy, FileJson, Image as ImageIcon } from "lucide-react";
import type { CharacterRecord } from "../character-types";
import { newId, nowIso } from "@/lib/id";
import { useCharacterStore } from "../character-store";
import {
  parseCcv3FromPng,
  parseCcv3Json,
  ccv3ToVeyra,
} from "../ai-assist/character-io";

interface ImportPreviewModalProps {
  source: "json" | "png";
  text?: string;
  bytes?: Uint8Array;
  existing: CharacterRecord[];
  onClose: () => void;
  onImported: (c: CharacterRecord) => void;
}

export function ImportPreviewModal({
  source,
  text,
  bytes,
  existing,
  onClose,
  onImported,
}: ImportPreviewModalProps) {
  const createCharacter = useCharacterStore((s) => s.createCharacter);
  const [renameTo, setRenameTo] = useState<string | null>(null);
  const [resolveMode, setResolveMode] = useState<"rename" | "saveAsCopy" | "replace">("saveAsCopy");
  const [targetExistingId, setTargetExistingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseResult = useMemo(() => {
    try {
      if (source === "json" && text) {
        return { ok: true as const, ...parseCcv3Json(text) };
      }
      if (source === "png" && bytes) {
        return { ok: true as const, ...parseCcv3FromPng(bytes) };
      }
      return { ok: false as const, error: "No file content." };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [source, text, bytes]);

  const draft: Partial<CharacterRecord> | null = useMemo(() => {
    if (!parseResult.ok) return null;
    const { record } = ccv3ToVeyra(parseResult.card);
    return record;
  }, [parseResult]);

  const warnings = useMemo(() => {
    if (!parseResult.ok) return [];
    return parseResult.warnings;
  }, [parseResult]);

  const sourceId = parseResult.ok ? parseResult.card.id ?? undefined : undefined;
  const duplicateById = useMemo(
    () => (sourceId ? existing.find((c) => c.id === sourceId) ?? null : null),
    [existing, sourceId],
  );
  const duplicateByName = draft?.name
    ? existing.find((c) => c.name === draft.name) ?? null
    : null;

  if (!parseResult.ok) {
    return (
      <ModalShell onClose={onClose} title="Import failed">
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
          {parseResult.error}
        </div>
        <p className="mt-3 text-[12px] text-[var(--color-text-dim)]">
          The file couldn't be parsed. CCv3 JSON files should contain a top-level
          <code className="mx-1 rounded bg-[var(--color-bg)] px-1">data</code>
          object. PNG files must contain a <code className="mx-1 rounded bg-[var(--color-bg)] px-1">chara</code> tEXt chunk.
        </p>
      </ModalShell>
    );
  }

  if (!draft) {
    return (
      <ModalShell onClose={onClose} title="Import failed">
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
          No draft could be produced.
        </div>
      </ModalShell>
    );
  }

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const now = nowIso();
      const id = newId("char");
      const name = resolveMode === "rename" && renameTo?.trim()
        ? renameTo.trim()
        : (draft.name ?? "Unnamed");

      // If "replace" is selected, update the existing record in place.
      if (resolveMode === "replace" && targetExistingId) {
        const existingRecord = existing.find((c) => c.id === targetExistingId);
        if (!existingRecord) {
          setError("Target character no longer exists.");
          setBusy(false);
          return;
        }
        const updated = await useCharacterStore.getState().updateCharacter({
          id: targetExistingId,
          name,
          title: draft.title ?? existingRecord.title,
          tagline: draft.tagline ?? existingRecord.tagline,
          description: draft.description ?? existingRecord.description,
          personality: draft.personality ?? existingRecord.personality,
          scenario: draft.scenario ?? existingRecord.scenario,
          firstMessage: draft.firstMessage ?? existingRecord.firstMessage,
          alternateGreetings: draft.alternateGreetings ?? existingRecord.alternateGreetings,
          systemPrompt: draft.systemPrompt ?? existingRecord.systemPrompt,
          postHistoryInstructions:
            draft.postHistoryInstructions ?? existingRecord.postHistoryInstructions,
          exampleMessages: draft.exampleMessages ?? existingRecord.exampleMessages,
          creatorNotes: draft.creatorNotes ?? existingRecord.creatorNotes,
          tags: draft.tags ?? existingRecord.tags,
          category: draft.category ?? existingRecord.category,
          version: draft.version ?? existingRecord.version,
          spec: "chara_card_v3",
          source: "imported_ccv3",
          isGlobal: existingRecord.isGlobal,
          projectId: existingRecord.projectId,
          lorebookEntries: draft.lorebookEntries ?? existingRecord.lorebookEntries,
          chatDefaults: draft.chatDefaults ?? existingRecord.chatDefaults,
          updatedAt: now,
        });
        onImported(updated);
        onClose();
        return;
      }

      const created = await createCharacter({
        id,
        name: resolveMode === "saveAsCopy" && duplicateByName
          ? `${name} (copy)`
          : name,
        title: draft.title,
        avatarPath: draft.avatarPath,
        avatarColor: draft.avatarColor ?? "indigo",
        tagline: draft.tagline,
        description: draft.description,
        personality: draft.personality,
        scenario: draft.scenario,
        firstMessage: draft.firstMessage,
        alternateGreetings: draft.alternateGreetings,
        systemPrompt: draft.systemPrompt,
        postHistoryInstructions: draft.postHistoryInstructions,
        exampleMessages: draft.exampleMessages,
        creatorNotes: draft.creatorNotes,
        tags: draft.tags,
        category: draft.category,
        version: draft.version ?? "1.0.0",
        spec: "chara_card_v3",
        creator: draft.creator,
        source: "imported_ccv3",
        isGlobal: true,
        projectId: "",
        lorebookEntries: draft.lorebookEntries,
        chatDefaults: draft.chatDefaults,
        createdAt: now,
        updatedAt: now,
      });
      onImported(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const dup = duplicateById ?? duplicateByName;

  return (
    <ModalShell
      onClose={onClose}
      title={source === "json" ? "Import CCv3 JSON" : "Import CCv3 PNG"}
      icon={source === "json" ? <FileJson className="size-4" /> : <ImageIcon className="size-4" />}
    >
      <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: "70vh" }}>
        <ConflictResolver
          duplicate={dup}
          resolveMode={resolveMode}
          setResolveMode={setResolveMode}
          targetExistingId={targetExistingId}
          setTargetExistingId={setTargetExistingId}
          renameTo={renameTo}
          setRenameTo={setRenameTo}
          draftName={draft.name ?? ""}
        />

        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-[11.5px] font-semibold text-amber-200">
              <AlertTriangle className="size-3.5" />
              {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </div>
            <ul className="list-disc pl-5 text-[11.5px] text-amber-100/85">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <FieldDiff label="Name" before="(empty)" after={draft.name} />
        <FieldDiff label="Title" before="(empty)" after={draft.title} />
        <FieldDiff label="Description" before="(empty)" after={draft.description} multiline />
        <FieldDiff label="Personality" before="(empty)" after={draft.personality} multiline />
        <FieldDiff label="Scenario" before="(empty)" after={draft.scenario} multiline />
        <FieldDiff label="First message" before="(empty)" after={draft.firstMessage} multiline />
        <FieldDiff
          label="Alternate greetings"
          before="(empty)"
          after={draft.alternateGreetings ?? []}
        />
        <FieldDiff
          label="Example dialogues"
          before="(empty)"
          after={draft.exampleMessages ?? []}
          multiline
        />
        <FieldDiff
          label="Tags"
          before="(empty)"
          after={(draft.tags ?? []).join(", ")}
        />
        <FieldDiff label="Creator" before="(empty)" after={draft.creator} />
        <FieldDiff label="Version" before="(empty)" after={draft.version} />
        <FieldDiff
          label="Lorebook entries"
          before="(empty)"
          after={`${(draft.lorebookEntries ?? []).length} entries`}
        />
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {error}
        </div>
      )}

      <footer className="mt-3 flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110 disabled:opacity-50"
        >
          <Save className="size-3" />
          {busy ? "Importing…" : "Import"}
        </button>
      </footer>
    </ModalShell>
  );
}

function ConflictResolver({
  duplicate,
  resolveMode,
  setResolveMode,
  setTargetExistingId,
  renameTo,
  setRenameTo,
  draftName,
}: {
  duplicate: CharacterRecord | null;
  resolveMode: "rename" | "saveAsCopy" | "replace";
  setResolveMode: (m: "rename" | "saveAsCopy" | "replace") => void;
  targetExistingId: string | null;
  setTargetExistingId: (id: string | null) => void;
  renameTo: string | null;
  setRenameTo: (s: string | null) => void;
  draftName: string;
}) {
  void setTargetExistingId;
  if (!duplicate) {
    return (
      <div className="rounded-md border border-emerald-300/30 bg-emerald-300/[0.06] p-3 text-[11.5px] text-emerald-200">
        <Check className="mr-1.5 inline size-3" />
        No conflicts. The card will be saved as a new character.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11.5px] font-semibold text-amber-200">
        <AlertTriangle className="size-3.5" />
        A character with this name already exists: <span className="text-white">{duplicate.name}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-2 text-[12px] text-white">
          <input
            type="radio"
            name="resolve"
            checked={resolveMode === "saveAsCopy"}
            onChange={() => setResolveMode("saveAsCopy")}
            className="mt-0.5 size-3.5 accent-[var(--color-accent)]"
          />
          <div>
            <div className="font-medium">Save as copy</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">
              Import with "{draftName} (copy)" so both exist.
            </div>
          </div>
        </label>
        <label className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-2 text-[12px] text-white">
          <input
            type="radio"
            name="resolve"
            checked={resolveMode === "rename"}
            onChange={() => {
              setResolveMode("rename");
              if (!renameTo) setRenameTo(`${draftName} (imported)`);
            }}
            className="mt-0.5 size-3.5 accent-[var(--color-accent)]"
          />
          <div className="flex-1">
            <div className="font-medium">Rename</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">Import under a new name:</div>
            <input
              type="text"
              value={renameTo ?? `${draftName} (imported)`}
              onChange={(e) => setRenameTo(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[12px] text-white focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>
        </label>
        <label className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-2 text-[12px] text-white">
          <input
            type="radio"
            name="resolve"
            checked={resolveMode === "replace"}
            onChange={() => {
              setResolveMode("replace");
              setTargetExistingId(duplicate.id);
            }}
            className="mt-0.5 size-3.5 accent-[var(--color-accent)]"
          />
          <div>
            <div className="font-medium">Replace existing</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">
              Overwrite all fields of <span className="text-white">{duplicate.name}</span> with the imported card.
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}

function FieldDiff({
  label,
  before,
  after,
  multiline = false,
}: {
  label: string;
  before: string;
  after: unknown;
  multiline?: boolean;
}) {
  const afterText = formatAfter(after);
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-2.5">
      <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11.5px]">
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
            Veyra (before)
          </div>
          <div
            className={`max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-1.5 text-white/60 ${
              multiline ? "min-h-[3.5rem]" : ""
            }`}
          >
            {before || "(empty)"}
          </div>
        </div>
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-emerald-200/80">
            Imported
          </div>
          <div
            className={`max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-emerald-300/20 bg-emerald-300/[0.04] p-1.5 text-white ${
              multiline ? "min-h-[3.5rem]" : ""
            }`}
          >
            {afterText || "(empty)"}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAfter(after: unknown): string {
  if (after === null || after === undefined) return "";
  if (typeof after === "string") return after;
  if (Array.isArray(after)) {
    if (after.length === 0) return "";
    return after
      .map((item) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object"
            ? JSON.stringify(item, null, 2)
            : String(item),
      )
      .join("\n\n");
  }
  if (typeof after === "object") return JSON.stringify(after, null, 2);
  return String(after);
}

function ModalShell({
  onClose,
  title,
  icon,
  children,
}: {
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-[640px] max-w-[95vw] flex-col gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-white">
            {icon}
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

// Unused but kept for future expansion.
void Merge;
void Copy;
