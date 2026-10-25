import { PlugZap, Sparkles } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { missingRequiredCapabilities } from "@/modules/extensions/skill-runtime";
import { disabledMcpServersForChat, isMcpEnabledForChat, useExtensionsStore } from "@/modules/extensions/extensions-store";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pb-1 pt-2 text-[10.5px] font-medium text-[var(--color-text-dim)]">{children}</p>;
}

function ChatSwitch({ active, onToggle, disabled = false }: { active: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={onToggle}
      className={`h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${active && !disabled ? "bg-blue-500" : "bg-white/10"}`}
    >
      <span className={`block size-3 rounded-full bg-white shadow-sm transition-transform ${active && !disabled ? "translate-x-3" : ""}`} />
    </button>
  );
}

export function ChatExtensionsSettings() {
  const chatId = useChatStore((state) => state.activeConversationId) ?? "new-chat";
  const projectId = useProjectStore((state) => state.activeProjectId) ?? undefined;
  const skills = useExtensionsStore((state) => state.skills);
  const skillsEnabled = useExtensionsStore((state) => state.featureFlags.skills);
  const mcpEnabled = useExtensionsStore((state) => state.featureFlags.mcp);
  const policies = useExtensionsStore((state) => state.policies);
  const servers = useExtensionsStore((state) => state.mcpServers);
  const activeSkillIds = useExtensionsStore((state) => state.activeSkillIds);
  const activeSkillWorkflowIds = useExtensionsStore((state) => state.activeSkillWorkflowIds);
  const disabledMcpIds = useExtensionsStore((state) => state.chatDisabledMcpServerIds[chatId]);
  const enabledMcpIds = useExtensionsStore((state) => state.chatEnabledMcpServerIds[chatId]);
  const setActiveSkill = useExtensionsStore((state) => state.setActiveSkill);
  const setChatMcpEnabled = useExtensionsStore((state) => state.setChatMcpEnabled);
  const projectPolicy = projectId ? policies[projectId] : undefined;
  const availableSkills = skillsEnabled
    ? skills.filter((skill) => skill.enabled && (!projectId || !projectPolicy || projectPolicy.enabledSkillIds.length === 0 || projectPolicy.enabledSkillIds.includes(skill.id)))
    : [];
  const activeSkillId = activeSkillIds[chatId] === undefined ? projectPolicy?.defaultSkillId : activeSkillIds[chatId];
  const activeSkillWorkflowId = activeSkillWorkflowIds[chatId];
  const availableServers = servers.filter((server) => server.health === "ready" && (!projectId || server.projectIds.length === 0 || server.projectIds.includes(projectId)));
  const disabledMcpServerIds = disabledMcpServersForChat(servers, disabledMcpIds);

  return (
    <div className="border-t border-white/[0.06] pb-1">
      <SectionLabel>Skills</SectionLabel>
      {!skillsEnabled ? (
        <p className="px-2 py-2 text-[10.5px] text-[var(--color-text-dim)]">Skills are turned off in Settings → Extensions.</p>
      ) : availableSkills.length === 0 ? (
        <p className="px-2 py-2 text-[10.5px] text-[var(--color-text-dim)]">No enabled Skills are available for this project.</p>
      ) : (
        <div role="radiogroup" aria-label="Active Skill" className="space-y-0.5">
          <button
            type="button"
            role="radio"
            aria-checked={!activeSkillId}
            onClick={() => setActiveSkill(chatId, null)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${!activeSkillId ? "bg-violet-400/10" : "hover:bg-white/[0.05]"}`}
          >
            <Sparkles className={`size-4 shrink-0 ${!activeSkillId ? "text-violet-200" : "text-[var(--color-text-dim)]"}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-white">No Skill</span>
              <span className="block truncate text-[10.5px] text-[var(--color-text-dim)]">Use slash commands in the composer to invoke one</span>
            </span>
          </button>
          {availableSkills.map((skill) => {
            const missing = missingRequiredCapabilities(skill, servers, projectId);
            const active = activeSkillId === skill.id && !activeSkillWorkflowId;
            return (
              <div key={skill.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={missing.length > 0}
                  title={missing.length > 0 ? `Configure required capability: ${missing.join(", ")}` : undefined}
                  onClick={() => setActiveSkill(chatId, skill.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${active ? "bg-violet-400/10" : "hover:bg-white/[0.05]"}`}
                >
                  <Sparkles className={`size-4 shrink-0 ${active ? "text-violet-200" : "text-[var(--color-text-dim)]"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-white">{skill.name}</span>
                    <span className="block truncate text-[10.5px] text-[var(--color-text-dim)]">{missing.length > 0 ? `Requires: ${missing.join(", ")}` : skill.description}</span>
                  </span>
                </button>
                {skill.workflows.map((workflow) => {
                  const workflowActive = activeSkillId === skill.id && activeSkillWorkflowId === workflow.id;
                  return (
                    <button
                      key={workflow.id}
                      type="button"
                      role="radio"
                      aria-checked={workflowActive}
                      disabled={missing.length > 0}
                      onClick={() => setActiveSkill(chatId, skill.id, workflow.id)}
                      className={`ml-8 flex w-[calc(100%-2rem)] items-center rounded-md px-2 py-1.5 text-left text-[10.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${workflowActive ? "bg-violet-400/10 text-violet-100" : "text-[var(--color-text-dim)] hover:bg-white/[0.05] hover:text-white"}`}
                    >
                      {workflow.name}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <SectionLabel>MCP servers</SectionLabel>
      {availableServers.length === 0 ? (
        <p className="px-2 py-2 text-[10.5px] text-[var(--color-text-dim)]">No connected MCP servers are available for this project.</p>
      ) : (
        <div className="space-y-0.5">
          {availableServers.map((server) => {
            const active = isMcpEnabledForChat(server, disabledMcpServerIds, enabledMcpIds);
            return (
              <div key={server.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/[0.05]">
                <PlugZap className={`size-4 shrink-0 ${active && mcpEnabled ? "text-cyan-300" : "text-[var(--color-text-dim)]"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-white">{server.name}</span>
                  <span className="block truncate text-[10.5px] text-[var(--color-text-dim)]">{server.description}</span>
                </span>
                <ChatSwitch active={active} disabled={!mcpEnabled} onToggle={() => setChatMcpEnabled(chatId, server.id, !active)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
