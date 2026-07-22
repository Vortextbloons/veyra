import { useMemo, useState } from "react";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { useExtensionsStore } from "@/modules/extensions/extensions-store";
import { missingRequiredCapabilities } from "@/modules/extensions/skill-runtime";

export function SkillSelector() {
  const [open, setOpen] = useState(false);
  const conversationId = useChatStore((state) => state.activeConversationId) ?? "new-chat";
  const projectId = useProjectStore((state) => state.activeProjectId) ?? undefined;
  const skills = useExtensionsStore((state) => state.skills);
  const policies = useExtensionsStore((state) => state.policies);
  const servers = useExtensionsStore((state) => state.mcpServers);
  const activeSkillIds = useExtensionsStore((state) => state.activeSkillIds);
  const activeSkillWorkflowIds = useExtensionsStore((state) => state.activeSkillWorkflowIds);
  const setActiveSkill = useExtensionsStore((state) => state.setActiveSkill);
  const available = useMemo(() => skills.filter((skill) => skill.enabled && (!projectId || !policies[projectId] || policies[projectId].enabledSkillIds.length === 0 || policies[projectId].enabledSkillIds.includes(skill.id))), [skills, projectId, policies]);
  const activeId = activeSkillIds[conversationId] === undefined ? policies[projectId ?? ""]?.defaultSkillId : activeSkillIds[conversationId];
  const active = available.find((skill) => skill.id === activeId);
  const activeWorkflow = active?.workflows.find((workflow) => workflow.id === activeSkillWorkflowIds[conversationId]);
  if (available.length === 0 && !active) return null;
  return <div className="relative">
    {active ? <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex h-7 max-w-48 items-center gap-1 rounded-md border border-violet-400/25 bg-violet-400/10 pl-2 text-[10.5px] text-violet-100"><Sparkles className="size-3 shrink-0" /><span className="truncate">{active.name}{activeWorkflow ? ` · ${activeWorkflow.name}` : ""}</span><X role="button" aria-label={`Remove ${active.name} skill`} onClick={(event) => { event.stopPropagation(); setActiveSkill(conversationId, null); }} className="mr-1 ml-auto size-3 rounded hover:bg-white/10" /></button> : <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[10.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"><Sparkles className="size-3" /> Skill <ChevronDown className="size-3" /></button>}
    {open && <div className="absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-1.5 shadow-xl shadow-black/40"><p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-dim)]">Use one skill or workflow for this message</p>{available.map((skill) => { const missing = missingRequiredCapabilities(skill, servers, projectId); const unavailable = missing.length > 0; return <div key={skill.id} className="rounded-lg"><button type="button" disabled={unavailable} title={unavailable ? `Configure required capability: ${missing.join(", ")}` : undefined} onClick={() => { setActiveSkill(conversationId, skill.id); setOpen(false); }} className="w-full px-2 py-2 text-left hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45"><span className="block text-[11.5px] font-medium text-white">{skill.name}</span><span className="block truncate text-[10px] text-[var(--color-text-dim)]">{unavailable ? `Requires: ${missing.join(", ")}` : skill.description}</span></button>{!unavailable && skill.workflows.map((workflow) => <button key={workflow.id} type="button" onClick={() => { setActiveSkill(conversationId, skill.id, workflow.id); setOpen(false); }} className="ml-2 w-[calc(100%-0.5rem)] border-l border-violet-400/25 px-2 py-1.5 text-left text-[10px] text-violet-200 hover:bg-violet-400/10">↳ {workflow.name}</button>)}</div>; })}</div>}
  </div>;
}
