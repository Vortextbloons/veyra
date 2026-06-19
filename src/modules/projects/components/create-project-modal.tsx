import { useState } from "react";
import { X, Folder, LayoutGrid, GraduationCap, Briefcase, Code2, Palette, FlaskConical } from "lucide-react";
import { useProjectStore } from "@/modules/projects/project-store";
import type { ProjectKind } from "@/modules/projects/project-types";
import { PROJECT_KIND_LABELS, PROJECT_COLORS } from "@/modules/projects/project-types";
import { DialogSurface } from "@/components/dialog-surface";

const KIND_OPTIONS: { kind: ProjectKind; icon: React.ReactNode; desc: string }[] = [
  { kind: "app", icon: <LayoutGrid className="size-4" />, desc: "A software application or product" },
  { kind: "codebase", icon: <Code2 className="size-4" />, desc: "A code repository or library" },
  { kind: "creative", icon: <Palette className="size-4" />, desc: "Writing, art, or creative work" },
  { kind: "research", icon: <FlaskConical className="size-4" />, desc: "Research or investigation" },
  { kind: "class", icon: <GraduationCap className="size-4" />, desc: "A course or learning project" },
  { kind: "client", icon: <Briefcase className="size-4" />, desc: "Client work or freelance" },
  { kind: "general", icon: <Folder className="size-4" />, desc: "Anything else" },
];

const COLOR_BG: Record<string, string> = {
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  rose: "bg-rose-500",
  pink: "bg-pink-500",
  slate: "bg-slate-500",
};

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const createProject = useProjectStore((s) => s.createProject);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ProjectKind>("general");
  const [color, setColor] = useState("indigo");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreate = name.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      await createProject(name.trim(), {
        description: description.trim(),
        kind,
        color,
        systemPrompt: systemPrompt.trim(),
      });
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <DialogSurface
      onClose={onClose}
      closeOnBackdrop={false}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      panelClassName="relative w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-[15px] font-semibold text-[var(--color-text)]">Create new project</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="size-4" />
          </button>
      </div>

      {/* Body */}
      <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
              Project name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tau Gem Upgrades"
              autoFocus
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) handleCreate();
                if (e.key === "Escape") onClose();
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
              Description <span className="text-[10px] text-[var(--color-text-dim)]">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>

          {/* Project type */}
          <div>
            <label className="mb-2 block text-[12px] font-medium text-[var(--color-text)]">
              Project type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => setKind(opt.kind)}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                    kind === opt.kind
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-white/20"
                  }`}
                >
                  <div className={`mt-0.5 ${kind === opt.kind ? "text-[var(--color-accent)]" : "text-[var(--color-text-dim)]"}`}>
                    {opt.icon}
                  </div>
                  <div>
                    <div className={`text-[12px] font-medium ${kind === opt.kind ? "text-white" : "text-[var(--color-text)]"}`}>
                      {PROJECT_KIND_LABELS[opt.kind]}
                    </div>
                    <div className="text-[10.5px] text-[var(--color-text-dim)]">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="mb-2 block text-[12px] font-medium text-[var(--color-text)]">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`size-7 rounded-full ${COLOR_BG[c] ?? "bg-indigo-500"} transition-all ${
                    color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--color-surface)]" : "opacity-60 hover:opacity-100"
                  }`}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* System prompt */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
              System prompt <span className="text-[10px] text-[var(--color-text-dim)]">(optional)</span>
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Project-level instructions for the AI. These are prepended to the system prompt when working in this project."
              rows={4}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[12px] font-medium text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate || creating}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2 text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? "Creating..." : "Create Project"}
          </button>
      </div>
    </DialogSurface>
  );
}
