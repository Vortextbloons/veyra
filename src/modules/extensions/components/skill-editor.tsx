import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Loader2, Sparkles, X } from "lucide-react";
import type { SkillRecord } from "@/modules/extensions/extension-types";
import { useSkillsStore } from "@/modules/extensions/skills-store";
import { composeSkillDocument, parseSkillDocument, slugifySkillName, validateSkillDraft } from "@/modules/extensions/skill-runtime";
import { generateSkillDraft } from "@/modules/extensions/skill-generator";
import { settingsButtonClass, settingsInputClass, settingsPrimaryButtonClass } from "@/components/settings/settings-ui";

/** Hides generated frontmatter while the body streams into the editor. */
function stripFrontmatter(source: string): string {
  return parseSkillDocument(source).instructions || source.replace(/^---[\s\S]*?---\s*/, "");
}

type DraftState = {
  name: string;
  description: string;
  instructions: string;
};

const TEMPLATE: DraftState = {
  name: "Writing companion",
  description: "Use when the user wants help shaping, tightening, or restructuring writing.",
  instructions: `# Writing companion

Start by identifying the audience and the outcome the writing should produce.
Prefer a short outline before drafting anything long.
Cut filler. Keep the user's voice.`,
};

/**
 * The Markdown editor for one Skill.
 *
 * Only three fields are editable because only three have meaning: the name,
 * the description that routes the AI to the Skill, and the instructions. IDs and
 * content hashes stay internal.
 *
 * The caller keys this component by the Skill ID, so opening a different Skill
 * mounts a fresh editor. That keeps the draft honest without mirroring props
 * into state on every render.
 */
export function SkillEditor({
  skill,
  onClose,
  onSaved,
}: {
  skill: SkillRecord | null;
  onClose: () => void;
  onSaved?: (skill: SkillRecord) => void;
}) {
  const createSkill = useSkillsStore((state) => state.createSkill);
  const updateSkill = useSkillsStore((state) => state.updateSkill);
  const importSkill = useSkillsStore((state) => state.importSkill);
  const [draft, setDraft] = useState<DraftState>(() => skill
    ? { name: skill.name, description: skill.description, instructions: skill.instructions }
    : TEMPLATE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generation, setGeneration] = useState("");
  const [generating, setGenerating] = useState(false);

  const validation = useMemo(
    () => validateSkillDraft({ name: draft.name, description: draft.description, instructions: draft.instructions }),
    [draft],
  );
  const slug = slugifySkillName(draft.name);

  const save = async () => {
    if (!validation.valid) return;
    setSaving(true);
    setError(null);
    try {
      const saved = skill
        ? await updateSkill(skill.id, { name: draft.name, description: draft.description, instructions: draft.instructions })
        : await createSkill({ name: draft.name, description: draft.description, instructions: draft.instructions, provenance: "local" });
      onSaved?.(saved);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this Skill.");
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const generated = await generateSkillDraft({
        description: generation,
        // Stream the body as it arrives so the editor shows progress.
        onChunk: (text) => setDraft((current) => ({ ...current, instructions: stripFrontmatter(text) })),
      });
      if (!generated) return;
      // The generator emits a full SKILL.md, so its frontmatter can fill the
      // routing fields and the body becomes the instructions.
      const parsed = parseSkillDocument(generated);
      setDraft((current) => ({
        name: current.name || parsed.name || "",
        description: current.description || parsed.description || "",
        instructions: parsed.instructions,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate a draft.");
    } finally {
      setGenerating(false);
    }
  };

  const exportSkill = async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const target = await save({
        title: "Export Skill",
        defaultPath: `${slug}.zip`,
        filters: [{ name: "Skill package", extensions: ["zip"] }],
      });
      if (!target) return;
      const document = composeSkillDocument({ slug, description: draft.description, instructions: draft.instructions, metadata: skill?.metadata });
      await invoke("export_skill_package", { targetPath: target, slug, skillMd: document, files: skill?.files ?? [], snapshotId: skill?.snapshotId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export this Skill.");
    }
  };

  const importPackage = async () => {
    try {
      const path = await open({ directory: true, multiple: false, title: "Select a folder containing SKILL.md" });
      if (!path || Array.isArray(path)) return;
      const snapshot = await invoke<{ skillMd: string; snapshotId: string; files: string[]; directoryName: string }>("snapshot_skill_directory", { sourcePath: path });
      const imported = await importSkill({ skillMd: snapshot.skillMd, files: snapshot.files, snapshotId: snapshot.snapshotId, fallbackName: snapshot.directoryName });
      setDraft({ name: imported.name, description: imported.description, instructions: imported.instructions });
      onSaved?.(imported);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import this Skill.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-white">{skill ? "Edit Skill" : "New Skill"}</p>
          <p className="mt-0.5 text-[12px] text-[var(--color-text-dim)]">
            The description tells the AI when to use this Skill. The instructions are what it follows.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close editor"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-medium text-white">Name</span>
          <input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="PDF tools"
            className={settingsInputClass}
          />
          <span className="mt-1 block font-mono text-[11px] text-[var(--color-text-dim)]">/{slug}</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-medium text-white">When to use it</span>
          <input
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            placeholder="Extract text and tables from PDF files."
            className={settingsInputClass}
          />
          <span className="mt-1 block text-[11px] text-[var(--color-text-dim)]">
            {draft.description.trim().length}/1024
          </span>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-[12.5px] font-medium text-white">Instructions</span>
        <textarea
          value={draft.instructions}
          onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))}
          rows={14}
          spellCheck={false}
          placeholder={"# Steps\n\n1. Read the source.\n2. Summarize in three bullets."}
          className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-3 font-mono text-[12px] leading-relaxed text-white outline-none transition-colors placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)]/60"
        />
      </label>

      {!skill && (
        <div className="rounded-lg border border-[var(--color-border)] bg-white/[0.02] p-3">
          <p className="text-[12px] font-medium text-white">Generate a starting point</p>
          <div className="mt-1.5 flex gap-2">
            <input
              value={generation}
              onChange={(event) => setGeneration(event.target.value)}
              placeholder="Describe the Skill you want"
              className={settingsInputClass}
            />
            <button
              type="button"
              disabled={generating || !generation.trim()}
              onClick={() => void generate()}
              className={`${settingsButtonClass} shrink-0`}
            >
              {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {generating ? "Writing…" : "Generate"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
            Generation only fills the instructions field. Review before saving.
          </p>
        </div>
      )}

      {validation.errors.map((item) => (
        <p key={item} className="text-[12px] text-rose-300">{item}</p>
      ))}
      {validation.warnings.map((item) => (
        <p key={item} className="text-[12px] text-amber-300">{item}</p>
      ))}
      {error && <p className="text-[12px] text-rose-300">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => void importPackage()} className={settingsButtonClass}>
            Import folder
          </button>
          <button type="button" onClick={() => void exportSkill()} disabled={!validation.valid} className={settingsButtonClass}>
            Export
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={settingsButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!validation.valid || saving}
            onClick={() => void save()}
            className={settingsPrimaryButtonClass}
          >
            {saving ? "Saving…" : skill ? "Save changes" : "Create Skill"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Preview of the exact `SKILL.md` that export and Pi see. */
export function SkillDocumentPreview({ skill }: { skill: SkillRecord }) {
  const document = useMemo(
    () => composeSkillDocument({ slug: skill.slug, description: skill.description, instructions: skill.instructions, metadata: skill.metadata }),
    [skill],
  );
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
      {document}
    </pre>
  );
}
