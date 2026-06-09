import { useState } from "react";
import { Save, X } from "lucide-react";
import type { ProjectRecord, ProjectKind } from "@/modules/projects/project-types";
import { PROJECT_KIND_LABELS, PROJECT_COLORS } from "@/modules/projects/project-types";
import { useProjectStore } from "@/modules/projects/project-store";

export function ProjectEditor({
  project,
  onClose,
}: {
  project: ProjectRecord;
  onClose: () => void;
}) {
  const updateProject = useProjectStore((s) => s.updateProject);

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [kind, setKind] = useState<ProjectKind>(project.kind);
  const [color, setColor] = useState(project.color);
  const [systemPrompt, setSystemPrompt] = useState(project.systemPrompt);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateProject(project.id, {
        name: name.trim(),
        description,
        kind,
        color,
        systemPrompt,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">Edit Project</h2>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </Field>

        <Field label="Kind">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(PROJECT_KIND_LABELS) as ProjectKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-md px-2.5 py-1 text-[11px] ${
                  kind === k
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-white/5 text-[var(--color-text-dim)] hover:bg-white/10"
                }`}
              >
                {PROJECT_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Color">
          <div className="flex gap-1.5">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-6 rounded-full bg-${c}-500/30 ${
                  color === c ? "ring-2 ring-white/50" : ""
                }`}
                title={c}
              />
            ))}
          </div>
        </Field>

        <Field label="System Prompt">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={8}
            placeholder="Project-level instructions for the AI..."
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <p className="mt-1 text-[10.5px] text-[var(--color-text-dim)]">
            These instructions are prepended to the AI system prompt when working in this project.
          </p>
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-6 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-4 py-1.5 text-[12px] text-[var(--color-text-dim)] hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          <Save className="size-3.5" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </label>
      {children}
    </div>
  );
}
