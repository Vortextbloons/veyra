import { Pin, PlugZap, Sparkles, X } from "lucide-react";
import { useAgentStore } from "@/modules/agents/agent-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { isMcpEnabledForChat, useExtensionsStore } from "@/modules/extensions/extensions-store";
import { useSkillsStore } from "@/modules/extensions/skills-store";
import { slugifySkillName } from "@/modules/extensions/skill-runtime";

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
      className={`h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${active && !disabled ? "bg-[var(--color-accent)]" : "bg-white/10"}`}
    >
      <span className={`block size-3 rounded-full bg-white shadow-sm transition-transform ${active && !disabled ? "translate-x-3" : ""}`} />
    </button>
  );
}

/**
 * Chat-scoped persistence for Skills, kept separate from the composer picker so
 * invoking a Skill once never quietly changes the rest of the chat.
 */
export function ChatExtensionsSettings() {
  const chatId = useAgentStore((state) => state.activeSessionId) ?? "new-chat";
  const projectId = useProjectStore((state) => state.activeProjectId) ?? undefined;
  const library = useSkillsStore((state) => state.skills);
  const skillsEnabled = useSkillsStore((state) => state.skillsEnabled);
  const modelInvocationDefault = useSkillsStore((state) => state.modelInvocationDefault);
  const chatSkillIds = useSkillsStore((state) => state.chatSkillIds[chatId]) ?? [];
  const addChatSkill = useSkillsStore((state) => state.addChatSkill);
  const removeChatSkill = useSkillsStore((state) => state.removeChatSkill);
  const mcpEnabled = useExtensionsStore((state) => state.featureFlags.mcp);
  const policies = useExtensionsStore((state) => state.policies);
  const servers = useExtensionsStore((state) => state.mcpServers);
  const disabledMcpIds = useExtensionsStore((state) => state.chatDisabledMcpServerIds[chatId]);
  const enabledMcpIds = useExtensionsStore((state) => state.chatEnabledMcpServerIds[chatId]);
  const setChatMcpEnabled = useExtensionsStore((state) => state.setChatMcpEnabled);
  const projectPolicy = projectId ? policies[projectId] : undefined;
  const availableSkills = skillsEnabled
    ? library.filter((skill) => skill.enabled && (!projectId || !projectPolicy || projectPolicy.enabledSkillIds.length === 0 || projectPolicy.enabledSkillIds.includes(skill.id)))
    : [];
  const pinned = chatSkillIds.flatMap((id) => availableSkills.filter((skill) => skill.id === id));
  const availableServers = servers.filter((server) => server.health === "ready" && (!projectId || server.projectIds.length === 0 || server.projectIds.includes(projectId)));

  return (
    <div className="border-t border-white/[0.06] pb-1">
      <SectionLabel>Skills used for this chat</SectionLabel>
      {!skillsEnabled ? (
        <p className="px-2 py-2 text-[10.5px] text-[var(--color-text-dim)]">Skills are turned off in Settings → Skills.</p>
      ) : (
        <>
          {pinned.length > 0 ? (
            <div className="space-y-0.5">
              {pinned.map((skill) => (
                <div key={skill.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/[0.05]">
                  <Pin className="size-4 shrink-0 text-violet-200" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-white">{skill.name}</span>
                    <span className="block truncate text-[10.5px] text-[var(--color-text-dim)]">{skill.description}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Stop using ${skill.name} in this chat`}
                    onClick={() => removeChatSkill(chatId, skill.id)}
                    className="grid size-5 shrink-0 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-2 py-2 text-[10.5px] text-[var(--color-text-dim)]">
              No Skills run in every message here. Type <span className="font-mono text-white/70">/</span> in the composer to use one for a single message.
            </p>
          )}
          <p className="px-2 pb-1 pt-1.5 text-[10px] leading-relaxed text-[var(--color-text-dim)]/80">
            {modelInvocationDefault
              ? "The model may also load Skills on its own. Choose Manual only in Settings → Skills to keep a specific one for yourself."
              : "Only you can apply Skills. Turn on “Let the model choose Skills” in Settings → Skills to let it load them on its own."}
          </p>

          {availableSkills.length > 0 && (
            <div className="mt-1">
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-dim)]/70">Add for every message</p>
              <div className="max-h-44 overflow-y-auto">
                {availableSkills.filter((skill) => !chatSkillIds.includes(skill.id)).map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => addChatSkill(chatId, skill.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                  >
                    <Sparkles className="size-3.5 shrink-0 text-[var(--color-text-dim)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] text-white/90">{skill.name}</span>
                      <span className="block truncate text-[10px] text-[var(--color-text-dim)]">{slugifySkillName(skill.name)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <SectionLabel>MCP servers</SectionLabel>
      {availableServers.length === 0 ? (
        <p className="px-2 py-2 text-[10.5px] text-[var(--color-text-dim)]">No connected MCP servers are available for this project.</p>
      ) : (
        <div className="space-y-0.5">
          {availableServers.map((server) => {
            const active = isMcpEnabledForChat(server, disabledMcpIds, enabledMcpIds);
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
