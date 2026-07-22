import { useMemo, useState } from "react";
import { CheckCircle2, FileCode2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useExtensionsStore } from "@/modules/extensions/extensions-store";
import { validateSkillSource } from "@/modules/extensions/skill-runtime";
import { McpServerSettings } from "@/modules/extensions/components/mcp-server-settings";
import { generateSkillDraft } from "@/modules/extensions/skill-generator";

const EXAMPLE = `# Writing companion

Help the user shape clear, practical writing. Start by identifying the audience and intended outcome. Prefer a concise outline before drafting long material.`;

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
  const [snapshot, setSnapshot] = useState<{ snapshotId: string; contentHash: string; packageManifest?: string; packageFiles?: string[] } | null>(null);
  const validation = useMemo(() => validateSkillSource(source), [source]);

  const install = async () => {
    if (!validation.valid) return;
    try {
      await installSkill({ name: validation.name ?? "Skill", description, source, provenance: draftProvenance, ...snapshot });
      setSource(EXAMPLE); setDescription(""); setSnapshot(null); setDraftProvenance("local"); setError(null); setEditing(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not install this skill."); }
  };
  const importFolder = async () => {
    try {
      const path = await open({ directory: true, multiple: false, title: "Select Skill package folder" });
      if (!path || Array.isArray(path)) return;
      const snapshot = await invoke<{ skillMd: string; snapshotId: string; contentHash: string; veyraJson?: string; files: string[] }>("snapshot_skill_directory", { sourcePath: path });
      setSource(snapshot.skillMd); setDescription(""); setSnapshot({ snapshotId: snapshot.snapshotId, contentHash: snapshot.contentHash, packageManifest: snapshot.veyraJson, packageFiles: snapshot.files }); setDraftProvenance("local"); setEditing(true); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import this Skill package."); setEditing(true); }
  };
  const importZip = async () => {
    try {
      const path = await open({ multiple: false, title: "Select Skill ZIP archive", filters: [{ name: "ZIP archive", extensions: ["zip"] }] });
      if (!path || Array.isArray(path)) return;
      const imported = await invoke<{ skillMd: string; snapshotId: string; contentHash: string; veyraJson?: string; files: string[] }>("snapshot_skill_zip", { sourcePath: path });
      setSource(imported.skillMd); setDescription(""); setSnapshot({ snapshotId: imported.snapshotId, contentHash: imported.contentHash, packageManifest: imported.veyraJson, packageFiles: imported.files }); setDraftProvenance("local"); setEditing(true); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import this Skill archive."); setEditing(true); }
  };
  const generate = async () => {
    setGenerating(true); setError(null); setEditing(true); setSnapshot(null);
    try { const draft = await generateSkillDraft({ description: generationRequest, onChunk: setSource }); setSource(draft); setDraftProvenance("generated"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate this Skill draft."); }
    finally { setGenerating(false); }
  };

  return <section className="mx-auto max-w-4xl space-y-6">
    <div className="rounded-xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-[var(--color-panel)] to-[var(--color-panel)] p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-violet-300/20 bg-violet-400/10 text-violet-200"><ShieldCheck className="size-4" /></span>
        <div><h2 className="text-[14px] font-semibold text-white">Extensions</h2><p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--color-text-dim)]">Skills are reviewed local instructions. They can guide a chat, but cannot run code, change permissions, or activate themselves. MCP servers will appear here when the secure host service is enabled.</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px]"><span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[var(--color-text-dim)]">{skills.filter((skill) => skill.enabled).length} active skills</span><span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[var(--color-text-dim)]">{grants.filter((grant) => !grant.revokedAt && grant.decision === "allow").length} active approvals</span></div>
    </div>

    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4"><h3 className="text-[13px] font-medium text-white">Extension safety controls</h3><p className="mt-0.5 text-[11px] text-[var(--color-text-dim)]">Turning off a control immediately removes it from new chat tool snapshots.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{([['skills', 'Skills'], ['mcp', 'MCP execution'], ['stdio', 'Local stdio MCP'], ['streamableHttp', 'Remote Streamable HTTP MCP']] as const).map(([flag, label]) => <label key={flag} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/10 px-3 py-2 text-[11px] text-white"><span>{label}</span><input type="checkbox" checked={featureFlags[flag]} onChange={(event) => setFeatureFlag(flag, event.target.checked)} className="accent-violet-500" /></label>)}</div></div>

    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3"><div><h3 className="text-[13px] font-medium text-white">Skills</h3><p className="mt-0.5 text-[11px] text-[var(--color-text-dim)]">Install from a reviewed SKILL.md source or a copied local package.</p></div><div className="flex gap-2"><button type="button" onClick={() => void importFolder()} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-text-dim)] hover:text-white">Import folder</button><button type="button" onClick={() => void importZip()} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-text-dim)] hover:text-white">Import ZIP</button><button type="button" onClick={() => setEditing((value) => !value)} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[11px] font-medium text-white"><Plus className="size-3.5" /> Add skill</button></div></div>
      {editing && <div className="border-b border-[var(--color-border)] p-4">
        <label className="block text-[11px] font-medium text-white">Generate with AI</label>
        <div className="mt-1 flex gap-2"><input value={generationRequest} onChange={(event) => setGenerationRequest(event.target.value)} placeholder="Describe the Skill you want to create" className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-black/10 px-3 py-2 text-[11px] text-white" /><button type="button" disabled={generating || !generationRequest.trim()} onClick={() => void generate()} className="rounded-md border border-violet-400/30 px-3 py-1.5 text-[11px] text-violet-100 disabled:opacity-40">{generating ? "Generating…" : "Generate draft"}</button></div>
        <p className="mt-1 text-[10px] text-[var(--color-text-dim)]">Generation creates an editable draft only. It is never installed automatically.</p>
        <label className="mb-1 mt-3 block text-[11px] font-medium text-white">SKILL.md source</label><textarea value={source} onChange={(event) => { setSource(event.target.value); setSnapshot(null); }} rows={9} spellCheck={false} className="w-full rounded-lg border border-[var(--color-border)] bg-black/10 p-3 font-mono text-[11px] leading-relaxed text-white outline-none focus:border-violet-400/50" /><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional short description" className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-black/10 px-3 py-2 text-[11px] text-white outline-none focus:border-violet-400/50" />{validation.errors.map((item) => <p key={item} className="mt-2 text-[11px] text-rose-300">{item}</p>)}{validation.warnings.map((item) => <p key={item} className="mt-2 text-[11px] text-amber-300">{item}</p>)}{error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}<div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-md px-3 py-1.5 text-[11px] text-[var(--color-text-dim)] hover:text-white">Cancel</button><button type="button" disabled={!validation.valid || generating} onClick={() => void install()} className="rounded-md bg-violet-500 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-40">Review & install</button></div></div>}
      <div className="divide-y divide-[var(--color-border)]">{skills.length === 0 ? <div className="px-4 py-10 text-center"><FileCode2 className="mx-auto size-5 text-[var(--color-text-dim)]" /><p className="mt-2 text-[12px] text-white">No skills installed</p><p className="mt-1 text-[11px] text-[var(--color-text-dim)]">Add a SKILL.md to make a reviewed instruction package available.</p></div> : skills.map((skill) => <div key={skill.id} className="flex items-center gap-3 px-4 py-3"><span className="grid size-8 place-items-center rounded-md bg-violet-400/10 text-violet-200"><FileCode2 className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-[12px] font-medium text-white">{skill.name}</p><span className="text-[10px] text-[var(--color-text-dim)]">v{skill.version}</span>{skill.enabled && <CheckCircle2 className="size-3 text-emerald-400" />}</div><p className="truncate text-[10.5px] text-[var(--color-text-dim)]">{skill.description}</p></div><button type="button" onClick={() => setSkillEnabled(skill.id, !skill.enabled)} className={`rounded-md px-2 py-1 text-[10px] ${skill.enabled ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-[var(--color-text-dim)]"}`}>{skill.enabled ? "Enabled" : "Disabled"}</button><button type="button" aria-label={`Remove ${skill.name}`} onClick={() => removeSkill(skill.id)} className="p-1.5 text-[var(--color-text-dim)] hover:text-rose-300"><Trash2 className="size-3.5" /></button></div>)}</div>
    </div>
    <McpServerSettings />
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3"><h3 className="text-[13px] font-medium text-white">Permissions</h3><p className="mt-0.5 text-[11px] text-[var(--color-text-dim)]">Approvals are tied to a server capability and automatically expire when that server changes.</p></div>
      {grants.filter((grant) => !grant.revokedAt).length === 0 ? <p className="px-4 py-6 text-[11px] text-[var(--color-text-dim)]">No active extension approvals.</p> : <div className="divide-y divide-[var(--color-border)]">{grants.filter((grant) => !grant.revokedAt).slice().reverse().map((grant) => <div key={grant.id} className="flex items-center gap-3 px-4 py-3"><span className={`size-2 rounded-full ${grant.decision === "allow" ? "bg-emerald-400" : "bg-rose-400"}`} /><div className="min-w-0 flex-1"><p className="truncate text-[11px] text-white">{grant.capabilityId}</p><p className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">{grant.projectId ? "This project" : grant.chatId ? "This chat" : "All chats"} · {grant.category.replaceAll("_", " ")}{grant.expiresAt ? ` · expires ${new Date(grant.expiresAt).toLocaleString()}` : ""}</p></div><button type="button" onClick={() => revokeGrant(grant.id)} className="rounded-md border border-rose-400/20 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-400/10">Revoke</button></div>)}</div>}
    </div>
    {diagnostics.length > 0 && <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4"><div className="flex items-center justify-between"><div><h3 className="text-[12px] font-medium text-white">Extension diagnostics</h3><p className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">Redacted local errors and suggested next actions.</p></div><button type="button" onClick={() => clearDiagnostics()} className="text-[10px] text-[var(--color-text-dim)] hover:text-white">Clear</button></div><div className="mt-3 space-y-2">{diagnostics.slice(-5).reverse().map((item) => <div key={item.id} className="rounded-md border border-white/[0.06] bg-black/10 p-2"><p className="text-[10.5px] text-amber-100">{item.message}</p>{item.remediation && <p className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">{item.remediation}</p>}</div>)}</div></div>}
  </section>;
}
