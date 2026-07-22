import { useExtensionsStore } from "@/modules/extensions/extensions-store";

export function ProjectSkillsSettings({ projectId }: { projectId: string }) {
  const skills = useExtensionsStore((state) => state.skills);
  const servers = useExtensionsStore((state) => state.mcpServers);
  const policy = useExtensionsStore((state) => state.policies[projectId]);
  const setProjectPolicy = useExtensionsStore((state) => state.setProjectPolicy);
  const saveMcpServer = useExtensionsStore((state) => state.saveMcpServer);
  const enabledIds = policy?.enabledSkillIds ?? [];
  const toggle = (id: string) => setProjectPolicy(projectId, {
    enabledSkillIds: enabledIds.includes(id) ? enabledIds.filter((item) => item !== id) : [...enabledIds, id],
  });

  return (
    <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
      <h4 className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">Extensions</h4>
      <p className="mt-1 text-[10.5px] text-[var(--color-text-dim)]">Choose which installed Skills this project can use. A default remains visible in the composer and can be removed per chat.</p>
      {skills.length === 0 ? <p className="mt-3 text-[11px] text-[var(--color-text-dim)]">Install a SKILL.md from Settings → Extensions first.</p> : (
        <div className="mt-3 space-y-1.5">
          {skills.map((skill) => (
            <div key={skill.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
              <label className="min-w-0 flex items-center gap-2 text-[11.5px] text-white">
                <input type="checkbox" checked={enabledIds.includes(skill.id)} disabled={!skill.enabled} onChange={() => toggle(skill.id)} className="accent-violet-500" />
                <span className="truncate">{skill.name}</span>
                {!skill.enabled && <span className="text-[10px] text-[var(--color-text-dim)]">disabled</span>}
              </label>
              {enabledIds.includes(skill.id) && <button type="button" onClick={() => setProjectPolicy(projectId, { defaultSkillId: policy?.defaultSkillId === skill.id ? undefined : skill.id })} className={`rounded px-1.5 py-0.5 text-[10px] ${policy?.defaultSkillId === skill.id ? "bg-violet-500/20 text-violet-200" : "text-[var(--color-text-dim)] hover:bg-white/5"}`}>{policy?.defaultSkillId === skill.id ? "Default" : "Make default"}</button>}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 border-t border-[var(--color-border)] pt-3">
        <p className="text-[11px] font-medium text-white">MCP servers</p>
        <p className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">Only enabled servers are offered to models in this project.</p>
        {servers.length === 0 ? <p className="mt-2 text-[10px] text-[var(--color-text-dim)]">No MCP servers configured.</p> : <div className="mt-2 space-y-1">{servers.map((server) => {
          const enabled = server.projectIds.includes(projectId);
          return <label key={server.id} className="flex items-center gap-2 rounded px-1 py-1 text-[10.5px] text-white hover:bg-white/[0.03]"><input type="checkbox" checked={enabled} onChange={() => saveMcpServer({ ...server, projectIds: enabled ? server.projectIds.filter((id) => id !== projectId) : [...server.projectIds, projectId] })} className="accent-violet-500" />{server.name}<span className="ml-auto text-[9px] text-[var(--color-text-dim)]">{server.health}</span></label>;
        })}</div>}
      </div>
    </div>
  );
}
