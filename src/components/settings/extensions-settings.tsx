import { useMemo, useState } from "react";
import { CheckCircle2, FileCode2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useExtensionsStore } from "@/modules/extensions/extensions-store";
import { validateSkillSource } from "@/modules/extensions/skill-runtime";
import { McpServerSettings } from "@/modules/extensions/components/mcp-server-settings";
import { generateSkillDraft } from "@/modules/extensions/skill-generator";
import {
  EmptyState,
  SettingRow,
  SettingsCallout,
  SettingsCard,
  SettingsHeader,
  SettingsPanel,
  SettingsRows,
  settingsButtonClass,
  settingsInputClass,
  settingsPrimaryButtonClass,
} from "./settings-ui";

const EXAMPLE = `# Writing companion

Help the user shape clear, practical writing. Start by identifying the audience and intended outcome. Prefer a concise outline before drafting long material.`;

const FEATURE_FLAGS = [
  ["skills", "Skills", "Reviewed instruction packages a chat can load."],
  ["mcp", "MCP execution", "Any tool exposed by an MCP server."],
  ["stdio", "Local MCP servers", "Servers Veyra starts as a child process on this machine."],
  ["streamableHttp", "Remote MCP servers", "Servers reached over HTTP from a remote host."],
] as const;

export function ExtensionsSettings() {
  const skills = useExtensionsStore((state) => state.skills);
  const installSkill = useExtensionsStore((state) => state.installSkill);
  const removeSkill = useExtensionsStore((state) => state.removeSkill);
  const setSkillEnabled = useExtensionsStore((state) => state.setSkillEnabled);
  const diagnostics = useExtensionsStore((state) => state.diagnostics);
  const grants = useExtensionsStore((state) => state.grants);
  const clearDiagnostics = useExtensionsStore((state) => state.clearDiagnostics);
  const revokeGrant = useExtensionsStore((state) => state.revokeGrant);
  const featureFlags = useExtensionsStore((state) => state.featureFlags);
  const setFeatureFlag = useExtensionsStore((state) => state.setFeatureFlag);

  const [source, setSource] = useState(EXAMPLE);
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [generationRequest, setGenerationRequest] = useState("");
  const [generating, setGenerating] = useState(false);
  const [draftProvenance, setDraftProvenance] = useState<"local" | "generated">("local");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{
    snapshotId: string;
    contentHash: string;
    packageManifest?: string;
    packageFiles?: string[];
  } | null>(null);

  const validation = useMemo(() => validateSkillSource(source), [source]);
  const activeSkills = skills.filter((skill) => skill.enabled).length;
  const activeGrants = grants.filter(
    (grant) => !grant.revokedAt && grant.decision === "allow",
  ).length;
  const activePermissions = grants.filter((grant) => !grant.revokedAt);

  const install = async () => {
    if (!validation.valid) return;
    try {
      await installSkill({
        name: validation.name ?? "Skill",
        description,
        source,
        provenance: draftProvenance,
        ...snapshot,
      });
      setSource(EXAMPLE);
      setDescription("");
      setSnapshot(null);
      setDraftProvenance("local");
      setError(null);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not install this skill.");
    }
  };

  const importFolder = async () => {
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: "Select Skill package folder",
      });
      if (!path || Array.isArray(path)) return;
      const imported = await invoke<{
        skillMd: string;
        snapshotId: string;
        contentHash: string;
        veyraJson?: string;
        files: string[];
      }>("snapshot_skill_directory", { sourcePath: path });
      setSource(imported.skillMd);
      setDescription("");
      setSnapshot({
        snapshotId: imported.snapshotId,
        contentHash: imported.contentHash,
        packageManifest: imported.veyraJson,
        packageFiles: imported.files,
      });
      setDraftProvenance("local");
      setEditing(true);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import this Skill package.");
      setEditing(true);
    }
  };

  const importZip = async () => {
    try {
      const path = await open({
        multiple: false,
        title: "Select Skill ZIP archive",
        filters: [{ name: "ZIP archive", extensions: ["zip"] }],
      });
      if (!path || Array.isArray(path)) return;
      const imported = await invoke<{
        skillMd: string;
        snapshotId: string;
        contentHash: string;
        veyraJson?: string;
        files: string[];
      }>("snapshot_skill_zip", { sourcePath: path });
      setSource(imported.skillMd);
      setDescription("");
      setSnapshot({
        snapshotId: imported.snapshotId,
        contentHash: imported.contentHash,
        packageManifest: imported.veyraJson,
        packageFiles: imported.files,
      });
      setDraftProvenance("local");
      setEditing(true);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import this Skill archive.");
      setEditing(true);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setEditing(true);
    setSnapshot(null);
    try {
      const draft = await generateSkillDraft({ description: generationRequest, onChunk: setSource });
      setSource(draft);
      setDraftProvenance("generated");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate this Skill draft.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <SettingsHeader
        title="Extensions"
        description="Skills are reviewed local instructions. They can guide a chat, but cannot run code, change permissions, or activate themselves."
        actions={
          <>
            <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[12px] text-[var(--color-text-dim)]">
              {activeSkills} active {activeSkills === 1 ? "skill" : "skills"}
            </span>
            <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[12px] text-[var(--color-text-dim)]">
              {activeGrants} active {activeGrants === 1 ? "approval" : "approvals"}
            </span>
          </>
        }
      />

      <SettingsPanel
        title="Safety controls"
        description="Turning a control off removes it from new chat tool snapshots immediately."
      >
        <SettingsCard>
          <SettingsRows>
            {FEATURE_FLAGS.map(([flag, label, description]) => (
              <SettingRow
                key={flag}
                label={label}
                description={description}
                className="py-3.5"
              >
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={featureFlags[flag]}
                  onChange={(event) => setFeatureFlag(flag, event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
              </SettingRow>
            ))}
          </SettingsRows>
        </SettingsCard>
      </SettingsPanel>

      <SettingsPanel
        title="Skills"
        description="Install from reviewed SKILL.md source, a local folder, or a ZIP archive."
        actions={
          <>
            <button type="button" onClick={() => void importFolder()} className={settingsButtonClass}>
              Import folder
            </button>
            <button type="button" onClick={() => void importZip()} className={settingsButtonClass}>
              Import ZIP
            </button>
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className={settingsPrimaryButtonClass}
            >
              <Plus className="size-3.5" />
              Add skill
            </button>
          </>
        }
      >
        <SettingsCard>
          {editing && (
            <div className="space-y-3 border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <p className="text-[13px] font-medium text-white">Generate a draft</p>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={generationRequest}
                    onChange={(event) => setGenerationRequest(event.target.value)}
                    placeholder="Describe the Skill you want to create"
                    className={settingsInputClass}
                  />
                  <button
                    type="button"
                    disabled={generating || !generationRequest.trim()}
                    onClick={() => void generate()}
                    className={`${settingsButtonClass} shrink-0`}
                  >
                    {generating ? "Generating…" : "Generate"}
                  </button>
                </div>
                <p className="mt-1 text-[11.5px] text-[var(--color-text-dim)]">
                  Generation produces an editable draft. Nothing installs automatically.
                </p>
              </div>

              <div>
                <label
                  htmlFor="skill-source"
                  className="mb-1.5 block text-[13px] font-medium text-white"
                >
                  SKILL.md source
                </label>
                <textarea
                  id="skill-source"
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value);
                    setSnapshot(null);
                  }}
                  rows={10}
                  spellCheck={false}
                  className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-3 font-mono text-[12px] leading-relaxed text-white outline-none transition-colors focus:border-[var(--color-accent)]/60"
                />
              </div>

              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional short description"
                className={settingsInputClass}
              />

              {validation.errors.map((item) => (
                <p key={item} className="text-[12px] text-rose-300">
                  {item}
                </p>
              ))}
              {validation.warnings.map((item) => (
                <p key={item} className="text-[12px] text-amber-300">
                  {item}
                </p>
              ))}
              {error && <p className="text-[12px] text-rose-300">{error}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className={settingsButtonClass}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!validation.valid || generating}
                  onClick={() => void install()}
                  className={settingsPrimaryButtonClass}
                >
                  Review &amp; install
                </button>
              </div>
            </div>
          )}

          {skills.length === 0 ? (
            <EmptyState
              icon={<FileCode2 className="size-5" />}
              title="No skills installed"
              description="Add a SKILL.md to make a reviewed instruction package available to chats."
            />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {skills.map((skill) => (
                <div key={skill.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-accent)]/12 text-[var(--color-focus)]">
                    <FileCode2 className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-white">{skill.name}</p>
                      <span className="font-mono text-[11px] text-[var(--color-text-dim)]">
                        v{skill.version}
                      </span>
                      {skill.enabled && <CheckCircle2 className="size-3.5 text-emerald-400" />}
                    </div>
                    <p className="truncate text-[12px] text-[var(--color-text-dim)]">
                      {skill.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSkillEnabled(skill.id, !skill.enabled)}
                    className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors ${
                      skill.enabled
                        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                        : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-white"
                    }`}
                  >
                    {skill.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${skill.name}`}
                    onClick={() => removeSkill(skill.id)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--color-text-dim)] transition-colors hover:bg-red-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </SettingsCard>
      </SettingsPanel>

      <McpServerSettings />

      <SettingsPanel
        title="Permissions"
        description="Approvals are tied to a server capability and expire automatically when that server changes."
      >
        <SettingsCard>
          {activePermissions.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="size-5" />}
              title="No active approvals"
              description="Approvals appear here when an extension asks for a capability you allow."
            />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {activePermissions
                .slice()
                .reverse()
                .map((grant) => (
                  <div key={grant.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        grant.decision === "allow" ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] text-white">{grant.capabilityId}</p>
                      <p className="mt-0.5 text-[11.5px] text-[var(--color-text-dim)]">
                        {grant.projectId ? "This project" : grant.chatId ? "This chat" : "All chats"}
                        {" · "}
                        {grant.category.replaceAll("_", " ")}
                        {grant.expiresAt ? ` · expires ${new Date(grant.expiresAt).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revokeGrant(grant.id)}
                      className="shrink-0 rounded-lg border border-rose-400/20 px-2.5 py-1 text-[11.5px] text-rose-200 transition-colors hover:bg-rose-400/10"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
            </div>
          )}
        </SettingsCard>
      </SettingsPanel>

      {diagnostics.length > 0 && (
        <SettingsPanel
          title="Diagnostics"
          description="Redacted local errors and suggested next actions."
          actions={
            <button type="button" onClick={() => clearDiagnostics()} className={settingsButtonClass}>
              Clear
            </button>
          }
        >
          <SettingsCard>
            <div className="divide-y divide-[var(--color-border)]">
              {diagnostics
                .slice(-5)
                .reverse()
                .map((item) => (
                  <div key={item.id} className="px-5 py-3">
                    <p className="text-[12.5px] text-amber-100">{item.message}</p>
                    {item.remediation && (
                      <p className="mt-0.5 text-[12px] text-[var(--color-text-dim)]">
                        {item.remediation}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </SettingsCard>
        </SettingsPanel>
      )}

      <SettingsCallout tone="info">
        MCP servers connect through the local host service. Tools from a server only reach a chat
        after you approve that capability.
      </SettingsCallout>
    </div>
  );
}
