import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { CreateMemoryNode, MemoryScope, MemoryStatus } from "@/lib/memory-types";
import { useMemoryStore } from "@/stores/memory-store";

const TYPE_OPTIONS: CreateMemoryNode["type"][] = [
  "preference", "project", "project_fact", "decision",
  "instruction", "summary", "task", "idea", "file_reference", "temporary_context",
];
const SCOPE_OPTIONS: MemoryScope[] = ["global", "project", "conversation", "session"];
const STATUS_OPTIONS: MemoryStatus[] = ["active", "needs_review", "approved", "rejected", "archived"];

type Props = {
  mode: "create" | "edit";
  initial?: Partial<CreateMemoryNode> & { id?: string };
  onSave: (values: Omit<CreateMemoryNode, "id"> & { id?: string }) => void | Promise<void>;
  onCancel: () => void;
};

function deriveSummary(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.slice(0, 140);
}

export function MemoryEditor({ mode, initial, onSave, onCancel }: Props) {
  const folders = useMemoryStore((s) => s.folders);
  const updateNode = useMemoryStore((s) => s.updateNode);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [type, setType] = useState<CreateMemoryNode["type"]>(initial?.type ?? "instruction");
  const [scope, setScope] = useState<MemoryScope>(initial?.scope ?? "global");
  const [folderId, setFolderId] = useState(initial?.folderId ?? folders[0]?.id ?? "default");
  const [tagsRaw, setTagsRaw] = useState((initial?.tags ?? []).join(", "));
  const [importance, setImportance] = useState<1 | 2 | 3 | 4 | 5>(
    (initial?.importance ?? 3) as 1 | 2 | 3 | 4 | 5,
  );
  const [confidence, setConfidence] = useState<number>(initial?.confidence ?? 1);
  const [status, setStatus] = useState<MemoryStatus>(initial?.status ?? "active");
  const [isPinned, setIsPinned] = useState<boolean>(initial?.isPinned ?? false);

  useEffect(() => {
    if (mode === "create" && !summary && content) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSummary(deriveSummary(content));
    }
  }, [content, mode, summary]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    const values: Omit<CreateMemoryNode, "id"> & { id?: string } = {
      folderId,
      title: title.trim(),
      content: content.trim(),
      summary: summary.trim() || deriveSummary(content),
      type,
      scope,
      tags,
      importance,
      confidence: Math.max(0, Math.min(1, confidence)),
      origin: initial?.origin ?? "manual_user_edit",
      status,
      isPinned,
    };
    if (mode === "edit" && initial && initial.id) {
      const id = initial.id;
      await updateNode({
        id,
        title: values.title,
        content: values.content,
        summary: values.summary,
        type: values.type,
        scope: values.scope,
        tags: values.tags,
        importance: values.importance,
        confidence: values.confidence,
        status: values.status,
        isPinned: values.isPinned,
        folderId: values.folderId,
      });
      onCancel();
    } else {
      await onSave(values);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex max-h-[88vh] w-[min(560px,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">
            {mode === "create" ? "New memory" : "Edit memory"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="grid size-6 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 text-[12.5px]">
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A short, distinctive title"
              className="h-7 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-white placeholder:text-[var(--color-text-dim)]/70 focus:border-[var(--color-accent)]/40 focus:outline-none"
            />
          </Field>
          <Field label="Content">
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="The full body of this memory…"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 leading-snug text-white placeholder:text-[var(--color-text-dim)]/70 focus:border-[var(--color-accent)]/40 focus:outline-none"
            />
          </Field>
          <Field label="Summary">
            <textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Auto-derived from content if left blank"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-white placeholder:text-[var(--color-text-dim)]/70 focus:border-[var(--color-accent)]/40 focus:outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={type} onChange={(v) => setType(v as CreateMemoryNode["type"])} options={TYPE_OPTIONS} />
            </Field>
            <Field label="Scope">
              <Select value={scope} onChange={(v) => setScope(v as MemoryScope)} options={SCOPE_OPTIONS} />
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(v) => setStatus(v as MemoryStatus)} options={STATUS_OPTIONS} />
            </Field>
            <Field label="Folder">
              <input
                type="text"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="h-7 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-white focus:border-[var(--color-accent)]/40 focus:outline-none"
              />
            </Field>
            <Field label="Importance (1-5)">
              <input
                type="number"
                min={1}
                max={5}
                value={importance}
                onChange={(e) => setImportance(Math.max(1, Math.min(5, Number(e.target.value) || 3)) as 1 | 2 | 3 | 4 | 5)}
                className="h-7 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono text-white focus:border-[var(--color-accent)]/40 focus:outline-none"
              />
            </Field>
            <Field label="Confidence (0-1)">
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={confidence}
                onChange={(e) => setConfidence(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                className="h-7 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono text-white focus:border-[var(--color-accent)]/40 focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Tags (comma-separated)">
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="ui, preference, veyra"
              className="h-7 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-white placeholder:text-[var(--color-text-dim)]/70 focus:border-[var(--color-accent)]/40 focus:outline-none"
            />
          </Field>

          <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-dim)]">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="size-3.5 accent-indigo-500"
            />
            Pin this memory
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-7 rounded-md px-3 text-[12px] text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || !content.trim()}
            className="h-7 rounded-md bg-[var(--color-accent)] px-3 text-[12px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110 disabled:opacity-40"
          >
            {mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: T[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-7 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-white focus:border-[var(--color-accent)]/40 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
