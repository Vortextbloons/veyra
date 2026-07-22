import { useState } from "react";
import { ChevronDown, PlugZap } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { useExtensionsStore } from "@/modules/extensions/extensions-store";

const EMPTY_DISABLED_SERVERS: string[] = [];

export function McpChatToggle() {
  const [open, setOpen] = useState(false);
  const chatId = useChatStore((state) => state.activeConversationId) ?? "new-chat";
  const projectId = useProjectStore((state) => state.activeProjectId);
  const servers = useExtensionsStore((state) => state.mcpServers);
  const disabled = useExtensionsStore((state) => state.chatDisabledMcpServerIds[chatId] ?? EMPTY_DISABLED_SERVERS);
  const setEnabled = useExtensionsStore((state) => state.setChatMcpEnabled);
  const available = servers.filter((server) => server.enabled && server.health === "ready" && (!projectId || server.projectIds.length === 0 || server.projectIds.includes(projectId)));
  if (available.length === 0) return null;
  const enabledCount = available.filter((server) => !disabled.includes(server.id)).length;
  return <div className="relative"><button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`flex h-7 items-center gap-1 rounded-md px-1.5 text-[10.5px] ${enabledCount ? "text-cyan-200 hover:bg-cyan-400/10" : "text-[var(--color-text-dim)] hover:bg-white/5"}`}><PlugZap className="size-3" /> MCP {enabledCount}/{available.length}<ChevronDown className="size-3" /></button>{open && <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-1.5 shadow-xl shadow-black/40"><p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-dim)]">MCP servers for this chat</p>{available.map((server) => { const enabled = !disabled.includes(server.id); return <button key={server.id} type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled(chatId, server.id, !enabled)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/5"><span className={`size-1.5 rounded-full ${enabled ? "bg-cyan-300" : "bg-white/20"}`} /><span className="min-w-0 flex-1 truncate text-[11px] text-white">{server.name}</span><span className="text-[10px] text-[var(--color-text-dim)]">{enabled ? "On" : "Off"}</span></button>; })}</div>}</div>;
}
