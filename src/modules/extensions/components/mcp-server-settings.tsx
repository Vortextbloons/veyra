import { useMemo, useState } from "react";
import { Activity, Plus, RefreshCw, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { findCapabilityGrant, useExtensionsStore } from "@/modules/extensions/extensions-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { useChatStore } from "@/stores/chat-store";
import { mcpCapabilityId } from "@/modules/extensions/mcp-tool-adapter";
import type { McpServerRecord, McpTransport, PermissionCategory } from "@/modules/extensions/extension-types";

type InspectorTab = "tools" | "resources" | "prompts" | "logs" | "permissions" | "configuration";
type ResourcePreview = { server: McpServerRecord; uri: string; mimeType?: string; text: string };

function capabilityName(item: unknown, fallback: string): string {
  const value = item as { name?: unknown; uri?: unknown };
  return typeof value.name === "string" ? value.name : typeof value.uri === "string" ? value.uri : fallback;
}

function contentText(value: Record<string, unknown>, kind: "resource" | "prompt"): string {
  const entries = kind === "resource"
    ? value.contents as Array<Record<string, unknown>> | undefined
    : (value.messages as Array<Record<string, unknown>> | undefined)?.map((message) => message.content as Record<string, unknown>);
  return (entries ?? []).map((entry) => typeof entry.text === "string" ? entry.text : "").filter(Boolean).join("\n\n");
}

export function McpServerSettings() {
  const servers = useExtensionsStore((state) => state.mcpServers);
  const grants = useExtensionsStore((state) => state.grants);
  const diagnostics = useExtensionsStore((state) => state.diagnostics);
  const save = useExtensionsStore((state) => state.saveMcpServer);
  const remove = useExtensionsStore((state) => state.removeMcpServer);
  const setDiscovery = useExtensionsStore((state) => state.setMcpDiscovery);
  const addGrant = useExtensionsStore((state) => state.addGrant);
  const addDiagnostic = useExtensionsStore((state) => state.addDiagnostic);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const activeChatId = useChatStore((state) => state.activeConversationId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("streamable_http");
  const [endpoint, setEndpoint] = useState("");
  const [executable, setExecutable] = useState("");
  const [argumentsText, setArgumentsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTab>("tools");
  const [message, setMessage] = useState<string | null>(null);
  const [resourcePreview, setResourcePreview] = useState<ResourcePreview | null>(null);
  const [approval, setApproval] = useState<{ server: McpServerRecord; tool: Record<string, unknown> } | null>(null);
  const [promptArguments, setPromptArguments] = useState("{}");

  const selected = servers.find((server) => server.id === inspecting);
  const selectedGrants = useMemo(() => grants.filter((grant) => grant.serverId === selected?.id && !grant.revokedAt), [grants, selected?.id]);
  const selectedDiagnostics = useMemo(() => diagnostics.filter((entry) => entry.source === selected?.id).slice(-25).reverse(), [diagnostics, selected?.id]);
  const approvalForTool = (server: McpServerRecord, toolName: string) => findCapabilityGrant(grants, {
    serverId: server.id,
    capabilityId: mcpCapabilityId(server.id, toolName),
    projectId: activeProjectId ?? undefined,
    chatId: activeChatId ?? undefined,
    capabilityFingerprint: server.capabilityFingerprint,
  });

  const connect = async (server: McpServerRecord) => {
    try {
      const result = server.transport === "streamable_http"
        ? await invoke<{ tools: unknown[]; resources: unknown[]; prompts: unknown[] }>("discover_streamable_http_mcp", { endpoint: server.endpoint })
        : await invoke<{ tools: unknown[]; resources: unknown[]; prompts: unknown[] }>("discover_stdio_mcp", { executable: server.executable, arguments: server.arguments ?? [], workingDirectory: server.workingDirectory ?? null });
      setDiscovery(server.id, result);
      setMessage("Capabilities refreshed.");
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "Connection failed";
      save({ ...server, health: "failed", lastError: detail, updatedAt: new Date().toISOString() });
      addDiagnostic({ source: server.id, severity: "error", code: "mcp.connection_failed", message: detail, remediation: "Check the connection or credentials, then reconnect." });
      setMessage(detail);
    }
  };

  const add = async () => {
    if (!name.trim() || (transport === "streamable_http" ? !endpoint.trim() : !executable.trim())) { setError("Enter a name and connection target."); return; }
    const now = new Date().toISOString();
    const server: McpServerRecord = {
      id: `mcp.${crypto.randomUUID()}`, type: "mcp_server", name: name.trim(), description: transport === "streamable_http" ? endpoint.trim() : executable.trim(), version: "unknown", enabled: true, provenance: "manual", installedAt: now, updatedAt: now, health: "disabled", transport,
      endpoint: transport === "streamable_http" ? endpoint.trim() : undefined, executable: transport === "stdio" ? executable.trim() : undefined,
      arguments: transport === "stdio" ? argumentsText.split(/\s+/).filter(Boolean) : undefined, timeoutMs: 30_000, projectIds: [], capabilityCount: { tools: 0, resources: 0, prompts: 0 },
    };
    save(server); setAdding(false); setName(""); setEndpoint(""); setExecutable(""); setArgumentsText(""); setError(null); await connect(server);
  };

  const requestResource = async (server: McpServerRecord, item: Record<string, unknown>) => {
    try {
      const result = server.transport === "streamable_http"
        ? await invoke<Record<string, unknown>>("read_streamable_http_mcp_resource", { endpoint: server.endpoint, uri: item.uri })
        : await invoke<Record<string, unknown>>("read_stdio_mcp_resource", { executable: server.executable, arguments: server.arguments ?? [], workingDirectory: server.workingDirectory ?? null, uri: item.uri });
      const text = contentText(result, "resource");
      if (!text) throw new Error("This resource did not return text that can be attached.");
      const first = (result.contents as Array<Record<string, unknown>> | undefined)?.[0];
      setResourcePreview({ server, uri: capabilityName(item, "resource"), mimeType: typeof first?.mimeType === "string" ? first.mimeType : undefined, text });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not read this resource."); }
  };

  const insertPrompt = async (server: McpServerRecord, item: Record<string, unknown>) => {
    try {
      const parsedArguments: unknown = JSON.parse(promptArguments || "{}");
      if (!parsedArguments || Array.isArray(parsedArguments) || typeof parsedArguments !== "object") throw new Error("Prompt arguments must be a JSON object.");
      const result = server.transport === "streamable_http"
        ? await invoke<Record<string, unknown>>("get_streamable_http_mcp_prompt", { endpoint: server.endpoint, name: item.name, arguments: parsedArguments })
        : await invoke<Record<string, unknown>>("get_stdio_mcp_prompt", { executable: server.executable, arguments: server.arguments ?? [], workingDirectory: server.workingDirectory ?? null, name: item.name, promptArguments: parsedArguments });
      const text = contentText(result, "prompt");
      if (!text) throw new Error("This prompt did not return editable text.");
      window.dispatchEvent(new CustomEvent("veyra:insert-composer-text", { detail: { text } }));
      setMessage("Prompt inserted into the composer. Review or edit it before sending.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not retrieve this prompt."); }
  };

  const grantApproval = (scope: "once" | "chat" | "project" | "all") => {
    if (!approval) return;
    if (scope === "chat" && !activeChatId) {
      setMessage("Open a chat before granting access for that chat.");
      return;
    }
    const toolName = capabilityName(approval.tool, "tool");
    const destructive = /\b(delete|destroy|drop|remove|terminate|reset|wipe)\b/i.test(toolName);
    const expiresAt = scope === "once" ? new Date(Date.now() + 5 * 60_000).toISOString() : undefined;
    addGrant({ serverId: approval.server.id, capabilityId: scope === "all" ? "*" : mcpCapabilityId(approval.server.id, toolName), category: (destructive ? "destructive" : "external_mutation") as PermissionCategory, decision: "allow", chatId: scope === "chat" || scope === "once" ? activeChatId ?? undefined : undefined, projectId: scope === "project" ? activeProjectId ?? undefined : undefined, expiresAt, usesRemaining: scope === "once" ? 1 : undefined });
    setMessage(scope === "all" ? `All non-destructive tools from ${approval.server.name} are now allowed.` : `${scope === "once" ? "One-time" : scope === "chat" ? "Chat" : "Project"} approval saved for ${toolName}.`);
    setApproval(null);
    setTab("permissions");
  };

  return <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]">
    <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3"><div><h3 className="text-[13px] font-medium text-white">MCP servers</h3><p className="mt-0.5 text-[11px] text-[var(--color-text-dim)]">Inspect every capability before it becomes available to chat.</p></div><button type="button" onClick={() => setAdding((value) => !value)} className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] text-white"><Plus className="size-3.5" /> Add server</button></div>
    {adding && <div className="space-y-2 border-b border-[var(--color-border)] p-4"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Server name" className="w-full rounded-md border border-[var(--color-border)] bg-black/10 px-3 py-2 text-[11px] text-white" /><select value={transport} onChange={(event) => setTransport(event.target.value as McpTransport)} style={{ colorScheme: "dark" }} className="rounded-md border border-[var(--color-border)] bg-[#1a1b21] px-2 py-2 text-[11px] text-white"><option value="streamable_http">Streamable HTTP</option><option value="stdio">Local stdio</option></select>{transport === "streamable_http" ? <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://server.example/mcp" className="w-full rounded-md border border-[var(--color-border)] bg-black/10 px-3 py-2 text-[11px] text-white" /> : <><input value={executable} onChange={(event) => setExecutable(event.target.value)} placeholder="Executable path" className="w-full rounded-md border border-[var(--color-border)] bg-black/10 px-3 py-2 text-[11px] text-white" /><input value={argumentsText} onChange={(event) => setArgumentsText(event.target.value)} placeholder="Arguments, separated by spaces" className="w-full rounded-md border border-[var(--color-border)] bg-black/10 px-3 py-2 text-[11px] text-white" /></>}{error && <p className="text-[11px] text-rose-300">{error}</p>}<button type="button" onClick={() => void add()} className="rounded-md bg-violet-500 px-3 py-1.5 text-[11px] font-medium text-white">Save and connect</button></div>}
    <div className="divide-y divide-[var(--color-border)]">{servers.length === 0 ? <p className="px-4 py-8 text-center text-[11px] text-[var(--color-text-dim)]">No MCP servers configured.</p> : servers.map((server) => <div key={server.id} className="flex items-center gap-3 px-4 py-3"><Activity className={`size-4 ${server.health === "ready" ? "text-emerald-400" : server.health === "failed" ? "text-rose-300" : "text-[var(--color-text-dim)]"}`} /><div className="min-w-0 flex-1"><p className="text-[12px] text-white">{server.name}</p><p className="truncate text-[10px] text-[var(--color-text-dim)]">{server.description} · {server.capabilityCount.tools} tools, {server.capabilityCount.resources} resources, {server.capabilityCount.prompts} prompts</p></div><button type="button" onClick={() => { setInspecting(server.id); setTab("tools"); }} className="text-[10px] text-violet-200 hover:text-white">Inspect</button><button type="button" onClick={() => void connect(server)} className="p-1.5 text-[var(--color-text-dim)] hover:text-white" title="Refresh capabilities"><RefreshCw className="size-3.5" /></button><button type="button" onClick={() => remove(server.id)} className="p-1.5 text-[var(--color-text-dim)] hover:text-rose-300" title="Remove server"><Trash2 className="size-3.5" /></button></div>)}</div>
    {selected && <div className="border-t border-[var(--color-border)] p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-[12px] font-medium text-white">{selected.name}</p><p className="text-[10px] text-[var(--color-text-dim)]">{selected.transport} · {selected.health}</p></div><button type="button" onClick={() => setInspecting(null)} className="text-[10px] text-[var(--color-text-dim)]">Close</button></div><div className="mb-3 flex gap-1 border-b border-[var(--color-border)] pb-2">{(["tools", "resources", "prompts", "logs", "permissions", "configuration"] as InspectorTab[]).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`rounded px-2 py-1 text-[10px] capitalize ${tab === item ? "bg-violet-400/15 text-violet-100" : "text-[var(--color-text-dim)] hover:text-white"}`}>{item}</button>)}</div>{message && <p className="mb-2 text-[10px] text-emerald-300">{message}</p>}
      {approval && <div className="mb-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3"><p className="text-[11px] font-medium text-amber-100">Allow {capabilityName(approval.tool, "tool")} from {approval.server.name}?</p><p className="mt-1 text-[10px] text-[var(--color-text-dim)]">This is an external action. Arguments and server data remain subject to Veyra policy.</p><div className="mt-2 flex flex-wrap gap-1"><button type="button" onClick={() => grantApproval("once")} className="rounded bg-amber-400/15 px-2 py-1 text-[10px] text-amber-100">Allow once</button>{!(/\b(delete|destroy|drop|remove|terminate|reset|wipe)\b/i.test(capabilityName(approval.tool, ""))) && <><button type="button" disabled={!activeChatId} title={!activeChatId ? "Open a chat first" : undefined} onClick={() => grantApproval("chat")} className="rounded bg-white/5 px-2 py-1 text-[10px] text-white disabled:cursor-not-allowed disabled:opacity-40">Allow for this chat</button><button type="button" disabled={!activeProjectId} onClick={() => grantApproval("project")} className="rounded bg-white/5 px-2 py-1 text-[10px] text-white disabled:opacity-40">Always for project</button><button type="button" onClick={() => grantApproval("all")} className="rounded bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-100">Allow all non-destructive tools</button></>}<button type="button" onClick={() => setApproval(null)} className="px-2 py-1 text-[10px] text-[var(--color-text-dim)]">Cancel</button></div></div>}
      {resourcePreview && <div className="mb-3 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.05] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[11px] font-medium text-cyan-100">{resourcePreview.server.name} · {resourcePreview.uri}</p><p className="text-[10px] text-[var(--color-text-dim)]">{resourcePreview.mimeType ?? "text/plain"} · ~{Math.ceil(resourcePreview.text.length / 4).toLocaleString()} tokens</p></div><button type="button" onClick={() => { window.dispatchEvent(new CustomEvent("veyra:insert-composer-text", { detail: { text: resourcePreview.text } })); setResourcePreview(null); setMessage("Resource attached to the composer. Review it before sending."); }} className="rounded bg-cyan-400/15 px-2 py-1 text-[10px] text-cyan-100">Attach</button></div><pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-[10px] text-cyan-50/80">{resourcePreview.text.slice(0, 8_000)}{resourcePreview.text.length > 8_000 ? "\n[Preview truncated]" : ""}</pre></div>}
      {tab === "tools" && <div className="space-y-1">{(selected.capabilities?.tools ?? []).map((item, index) => { const toolName = capabilityName(item, "tool"); const grant = approvalForTool(selected, toolName); return <div key={index} className="flex items-center justify-between gap-2 rounded-md border border-white/[0.06] px-2 py-2"><span className="min-w-0 truncate text-[11px] text-white">{toolName}</span>{grant ? <span className="shrink-0 rounded bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-200">{grant.usesRemaining ? "Allowed once" : grant.capabilityId === "*" ? "All tools allowed" : grant.chatId ? "Allowed in this chat" : grant.projectId ? "Allowed for project" : "Allowed"}</span> : <button type="button" onClick={() => setApproval({ server: selected, tool: item as Record<string, unknown> })} className="shrink-0 rounded bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200">Review access</button>}</div>; })}</div>}
      {tab === "resources" && <div className="space-y-1">{(selected.capabilities?.resources ?? []).map((item, index) => <button key={index} type="button" onClick={() => void requestResource(selected, item as Record<string, unknown>)} className="flex w-full items-center justify-between rounded-md border border-white/[0.06] px-2 py-2 text-left text-[11px] text-cyan-100 hover:bg-cyan-400/[0.05]"><span className="truncate">{capabilityName(item, "resource")}</span><span className="text-[10px]">Preview</span></button>)}</div>}
      {tab === "prompts" && <div className="space-y-2"><label className="block text-[10px] text-[var(--color-text-dim)]">Arguments (JSON object)<textarea value={promptArguments} onChange={(event) => setPromptArguments(event.target.value)} rows={2} spellCheck={false} className="mt-1 block w-full rounded border border-[var(--color-border)] bg-black/10 p-2 font-mono text-[10px] text-white" /></label>{(selected.capabilities?.prompts ?? []).map((item, index) => <button key={index} type="button" onClick={() => void insertPrompt(selected, item as Record<string, unknown>)} className="flex w-full items-center justify-between rounded-md border border-white/[0.06] px-2 py-2 text-left text-[11px] text-violet-100 hover:bg-violet-400/[0.05]"><span className="truncate">{capabilityName(item, "prompt")}</span><span className="text-[10px]">Insert</span></button>)}</div>}
      {tab === "logs" && <div className="space-y-1">{selectedDiagnostics.length === 0 ? <p className="text-[11px] text-[var(--color-text-dim)]">No redacted diagnostics for this server.</p> : selectedDiagnostics.map((entry) => <div key={entry.id} className="rounded-md border border-white/[0.06] bg-black/10 p-2"><p className="text-[10.5px] text-white">{entry.message}</p><p className="mt-0.5 text-[9px] text-[var(--color-text-dim)]">{entry.code} · {new Date(entry.createdAt).toLocaleString()}</p>{entry.remediation && <p className="mt-1 text-[10px] text-amber-200">{entry.remediation}</p>}</div>)}</div>}
      {tab === "permissions" && <div className="space-y-1">{selectedGrants.length === 0 ? <p className="text-[11px] text-[var(--color-text-dim)]">No active approvals.</p> : selectedGrants.map((grant) => <p key={grant.id} className="rounded-md border border-white/[0.06] px-2 py-2 text-[10px] text-[var(--color-text-dim)]">{grant.capabilityId} · {grant.projectId ? "project" : grant.chatId ? "chat" : "global"}</p>)}</div>}
      {tab === "configuration" && <div className="space-y-2"><label className="flex items-center justify-between rounded-md border border-white/[0.06] px-2 py-2 text-[11px] text-white">Enable this server<input type="checkbox" checked={selected.enabled} onChange={(event) => save({ ...selected, enabled: event.target.checked, health: event.target.checked ? selected.health === "disabled" ? "degraded" : selected.health : "disabled", updatedAt: new Date().toISOString() })} className="accent-violet-500" /></label><pre className="max-h-48 overflow-auto rounded-md bg-black/20 p-2 text-[10px] text-[var(--color-text-dim)]">{JSON.stringify({ transport: selected.transport, endpoint: selected.endpoint, executable: selected.executable, arguments: selected.arguments, timeoutMs: selected.timeoutMs, projectIds: selected.projectIds }, null, 2)}</pre></div>}
    </div>}
  </div>;
}
