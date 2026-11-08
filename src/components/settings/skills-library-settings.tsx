import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Copy, Download, FileCode2, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { SkillRecord } from "@/modules/extensions/extension-types";
import { useSkillsStore } from "@/modules/extensions/skills-store";
import { SkillDocumentPreview, SkillEditor } from "@/modules/extensions/components/skill-editor";
import { ModelAccessControl } from "@/modules/extensions/components/model-access-control";
import { modelInvocablePatch } from "@/modules/extensions/components/model-access";
import { composeSkillDocument } from "@/modules/extensions/skill-runtime";
import {
  EmptyState,
  SettingsCallout,
  SettingsCard,
  SettingsHeader,
  SettingsPanel,
  SettingsRows,
  SettingRow,
  settingsButtonClass,
  settingsIconButtonClass,
  settingsPrimaryButtonClass,
} from "./settings-ui";

/**
 * The Skill library.
 *
 * This is the whole management surface: create, edit, duplicate, delete, import,
 * and export. A Skill is Markdown instructions plus a description that says when
 * to use it, so the editor is a Markdown textarea rather than a form of options.
 */
export function SkillsLibrarySettings() {
  const skills = useSkillsStore((state) => state.skills);
  const skillsEnabled = useSkillsStore((state) => state.skillsEnabled);
  const setFeatureFlag = useSkillsStore((state) => state.setFeatureFlag);
  const removeSkill = useSkillsStore((state) => state.removeSkill);
  const setSkillEnabled = useSkillsStore((state) => state.setSkillEnabled);
  const duplicateSkill = useSkillsStore((state) => state.duplicateSkill);
  const importSkill = useSkillsStore((state) => state.importSkill);
  const convertWorkflow = useSkillsStore((state) => state.convertWorkflow);
  const modelInvocationDefault = useSkillsStore((state) => state.modelInvocationDefault);
  const setModelInvocationDefault = useSkillsStore((state) => state.setModelInvocationDefault);
  const setSkillModelInvocable = useSkillsStore((state) => state.setSkillModelInvocable);

  const [editing, setEditing] = useState<SkillRecord | null | "new">(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const sorted = useMemo(() => [...skills].sort((left, right) => left.name.localeCompare(right.name)), [skills]);
  const activeCount = skills.filter((skill) => skill.enabled).length;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const importFolder = () => run(async () => {
    const path = await open({ directory: true, multiple: false, title: "Select a folder containing SKILL.md" });
    if (!path || Array.isArray(path)) return;
    const snapshot = await invoke<{ skillMd: string; snapshotId: string; files: string[]; directoryName: string }>("snapshot_skill_directory", { sourcePath: path });
    await importSkill({ skillMd: snapshot.skillMd, files: snapshot.files, snapshotId: snapshot.snapshotId, fallbackName: snapshot.directoryName });
  });

  const importZip = () => run(async () => {
    const path = await open({ multiple: false, title: "Select a Skill ZIP", filters: [{ name: "Skill package", extensions: ["zip"] }] });
    if (!path || Array.isArray(path)) return;
    const snapshot = await invoke<{ skillMd: string; snapshotId: string; files: string[]; directoryName: string }>("snapshot_skill_zip", { sourcePath: path });
    await importSkill({ skillMd: snapshot.skillMd, files: snapshot.files, snapshotId: snapshot.snapshotId, fallbackName: snapshot.directoryName });
  });

  const exportSkill = (skill: SkillRecord) => run(async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const target = await save({ title: "Export Skill", defaultPath: `${skill.slug}.zip`, filters: [{ name: "Skill package", extensions: ["zip"] }] });
    if (!target) return;
    await invoke("export_skill_package", {
      targetPath: target,
      slug: skill.slug,
      skillMd: composeSkillDocument({ slug: skill.slug, description: skill.description, instructions: skill.instructions, metadata: skill.metadata }),
      files: skill.files ?? [],
      snapshotId: skill.snapshotId,
    });
  });

  return (
    <div className="space-y-8">
      <SettingsHeader
        title="Skills"
        description="Reusable Markdown instructions you can apply to a message or pin to a chat. A Skill never runs code; it only tells the AI how to approach the work."
        actions={
          <>
            <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[12px] text-[var(--color-text-dim)]">
              {activeCount} active {activeCount === 1 ? "Skill" : "Skills"}
            </span>
            <button type="button" disabled={busy} onClick={() => void importFolder()} className={settingsButtonClass}>
              <FileUp className="size-3.5" />
              Import folder
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing("new")} className={settingsPrimaryButtonClass}>
              <Plus className="size-3.5" />
              New Skill
            </button>
          </>
        }
      />

      {error && (
        <SettingsCallout tone="danger" title="That did not work">
          {error}
        </SettingsCallout>
      )}

      <SettingsPanel
        title="Library"
        description="Enabled Skills appear in the composer picker when you type /. Disabled Skills stay in the library but cannot be used."
        actions={
          <button type="button" disabled={busy} onClick={() => void importZip()} className={settingsButtonClass}>
            Import ZIP
          </button>
        }
      >
        <SettingsCard>
          {editing !== null && (
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <SkillEditor
                key={editing === "new" ? "new" : editing.id}
                skill={editing === "new" ? null : editing}
                onClose={() => setEditing(null)}
              />
            </div>
          )}

          {sorted.length === 0 ? (
            <EmptyState
              icon={<FileCode2 className="size-5" />}
              title="No Skills yet"
              description="Create one here, or import a folder containing SKILL.md."
              action={
                <button type="button" onClick={() => setEditing("new")} className={settingsPrimaryButtonClass}>
                  <Plus className="size-3.5" />
                  New Skill
                </button>
              }
            />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {sorted.map((skill) => {
                const expanded = inspecting === skill.id;
                return (
                  <div key={skill.id}>
                    <div className="flex items-start gap-3 px-5 py-3.5">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${skill.enabled ? "bg-violet-400/12 text-violet-200" : "bg-white/[0.04] text-[var(--color-text-dim)]"}`}>
                        <FileCode2 className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate text-[13px] font-medium text-white">{skill.name}</p>
                          <span className="font-mono text-[11px] text-[var(--color-text-dim)]">/{skill.slug}</span>
                          {skill.provenance === "generated" && (
                            <span className="rounded border border-[var(--color-border)] px-1.5 py-px text-[10px] text-[var(--color-text-dim)]">generated</span>
                          )}
                          {(skill.legacyWorkflows?.length ?? 0) > 0 && (
                            <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-px text-[10px] text-amber-200">
                              {skill.legacyWorkflows?.length} legacy workflow{(skill.legacyWorkflows?.length ?? 0) === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--color-text-dim)]">{skill.description}</p>
                        <div className="mt-1.5">
                          <ModelAccessControl
                            skill={skill}
                            defaultAllow={modelInvocationDefault}
                            disabled={!skill.enabled || !skillsEnabled}
                            onChange={(access) => setSkillModelInvocable(skill.id, modelInvocablePatch(access).modelInvocable)}
                          />
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => setEditing(skill)} aria-label={`Edit ${skill.name}`} title="Edit" className={settingsIconButtonClass}>
                          <Pencil className="size-3.5" />
                        </button>
                        <button type="button" disabled={busy} onClick={() => void run(() => duplicateSkill(skill.id))} aria-label={`Duplicate ${skill.name}`} title="Duplicate" className={settingsIconButtonClass}>
                          <Copy className="size-3.5" />
                        </button>
                        <button type="button" disabled={busy} onClick={() => void exportSkill(skill)} aria-label={`Export ${skill.name}`} title="Export as Skill package" className={settingsIconButtonClass}>
                          <Download className="size-3.5" />
                        </button>
                        <button type="button" onClick={() => setInspecting(expanded ? null : skill.id)} aria-label={`Preview SKILL.md for ${skill.name}`} title="Preview SKILL.md" className={settingsIconButtonClass}>
                          <FileCode2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSkillEnabled(skill.id, !skill.enabled)}
                          aria-pressed={skill.enabled}
                          className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors ${
                            skill.enabled
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                              : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-white"
                          }`}
                        >
                          {skill.enabled ? "Enabled" : "Disabled"}
                        </button>
                        {pendingDelete === skill.id ? (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => { removeSkill(skill.id); setPendingDelete(null); }}
                              className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11.5px] text-rose-200"
                            >
                              Delete
                            </button>
                            <button type="button" onClick={() => setPendingDelete(null)} className="rounded-lg px-2 py-1 text-[11.5px] text-[var(--color-text-dim)] hover:text-white">
                              Keep
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingDelete(skill.id)}
                            aria-label={`Delete ${skill.name}`}
                            title="Delete"
                            className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--color-text-dim)] transition-colors hover:bg-red-500/10 hover:text-rose-300"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="space-y-2 px-5 pb-4">
                        <p className="text-[11.5px] text-[var(--color-text-dim)]">
                          Exported as <span className="font-mono">{skill.slug}/SKILL.md</span>. This is exactly what a chat loads.
                        </p>
                        <SkillDocumentPreview skill={skill} />
                      </div>
                    )}

                    {(skill.legacyWorkflows?.length ?? 0) > 0 && (
                      <div className="mb-3 ml-[4.5rem] mr-5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                        <p className="text-[12px] text-amber-100">
                          This Skill came with workflows. Each can become its own Skill so it stays usable.
                        </p>
                        <div className="mt-1.5 space-y-1">
                          {skill.legacyWorkflows?.map((workflow) => (
                            <div key={workflow.id} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-[11.5px] text-amber-100/90">{workflow.name}</span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(() => convertWorkflow(skill.id, workflow.id))}
                                className="shrink-0 rounded-md border border-amber-400/30 px-2 py-0.5 text-[11px] text-amber-100 transition-colors hover:bg-amber-400/10"
                              >
                                Convert to Skill
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SettingsCard>
      </SettingsPanel>

      <SettingsPanel
        title="Who can use Skills"
        description="Manual use is always available. This only controls whether the model may pick a Skill up on its own."
      >
        <SettingsCard>
          <SettingsRows>
            <SettingRow
              label="Skills"
              description="Show Skills in the composer and allow them to apply to requests."
              className="py-3.5"
            >
              <input
                type="checkbox"
                aria-label="Enable Skills"
                checked={skillsEnabled}
                onChange={(event) => setFeatureFlag(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
            </SettingRow>
            <SettingRow
              label="Let the model choose Skills"
              description={
                modelInvocationDefault
                  ? "The model may load any Skill that is not set to Manual only. You can still apply Skills yourself."
                  : "Only you can apply Skills. Turn this on to let the model load them on its own, then restrict individual Skills to Manual only as needed."
              }
              className="py-3.5"
            >
              <input
                type="checkbox"
                aria-label="Let the model choose Skills"
                checked={modelInvocationDefault}
                disabled={!skillsEnabled}
                onChange={(event) => setModelInvocationDefault(event.target.checked)}
                className="size-4 accent-[var(--color-accent)] disabled:opacity-45"
              />
            </SettingRow>
          </SettingsRows>
        </SettingsCard>
      </SettingsPanel>

      <SettingsCallout tone="info">
        A Skill applies to one message by default. Use <span className="font-medium text-white">Pin</span> on its chip,
        or the Chat settings menu, to keep it on for every message in that chat.
      </SettingsCallout>
    </div>
  );
}
