import type { ProviderToolCall } from "@/lib/providers/types";
import { buildProviderTools } from "@/lib/tool-registry";
import { runSearch, buildSearchContextBlock, resolveSearchContextTokenLimit } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useExtensionsStore, findCapabilityGrant } from "@/modules/extensions/extensions-store";
import { buildMcpProviderTools, invokeMcpTool, mcpCapabilityId, resolveMcpTool } from "@/modules/extensions/mcp-tool-adapter";
import { normalizeArtifact } from "@/modules/chat/artifact";
import { normalizeInteractiveAnswer } from "@/modules/chat/interactive-answer";
import type { AgentEvent } from "./agent-types";
import { askPiQuestion } from "./pi-questions";
import { useSettingsStore } from "@/stores/settings-store";

export function createPiChatTools(options: { sessionId: string; scopeId: string; projectId?: string; webSearchEnabled: boolean; signal: AbortSignal; onOutput: (event: AgentEvent) => void }) {
  const { sessionId, scopeId, projectId, signal, onOutput } = options;
  const toolsNow = () => {
    const state = useExtensionsStore.getState();
    const policy = projectId ? state.policies[projectId] : undefined;
    const servers = state.mcpServers.filter((server) => (!server.projectIds.length || Boolean(projectId && server.projectIds.includes(projectId))) && (!policy?.enabledMcpServerIds.length || policy.enabledMcpServerIds.includes(server.id)));
    return [...buildProviderTools({ webSearchEnabled: options.webSearchEnabled && useConnectivityStore.getState().effectiveConnectivity === "online", codeExecutionEnabled: false, enhancedMode: true, interactiveAnswersEnabled: useSettingsStore.getState().interactiveAnswersEnabled, artifactsEnabled: useSettingsStore.getState().artifactsEnabled }).filter((tool) => tool.function.name !== "scratchpad_write"),
      ...buildMcpProviderTools(servers, projectId, state.featureFlags, state.chatDisabledMcpServerIds[scopeId], state.chatEnabledMcpServerIds[scopeId]).filter((tool) => !policy?.disabledCapabilityIds.includes(tool.function.name))];
  };
  const tools = toolsNow();
  return { tools, async handle(request: Record<string, unknown>): Promise<string | undefined> {
    if (signal.aborted) return undefined;
    if (request.title !== "veyra_tool") {
      return askPiQuestion(sessionId, String(request.title ?? "Question"), request.method === "confirm" ? ["true", "false"] : Array.isArray(request.options) ? request.options.map(String) : undefined, signal);
    }
    try {
      const call = JSON.parse(String(request.placeholder)) as ProviderToolCall;
      if (!tools.some((tool) => tool.function.name === call.name) || !toolsNow().some((tool) => tool.function.name === call.name)) throw new Error("This tool is no longer enabled.");
      if (!call.arguments || typeof call.arguments !== "object") throw new Error("Invalid tool arguments");
      if (call.name === "web_search") {
        const query = String(call.arguments.query ?? "").trim();
        if (!query) throw new Error("A search query is required");
        const bundle = await runSearch(query, { workflow: "chat", projectId, signal });
        return buildSearchContextBlock(bundle, { tokenLimit: resolveSearchContextTokenLimit({ projectId }) });
      }
      if (call.name === "ask_question") {
        const questions = Array.isArray(call.arguments.questions) ? call.arguments.questions.slice(0, 5) : [];
        const answers: string[] = [];
        for (const question of questions) {
          if (!question || typeof question.text !== "string") continue;
          const answer = await askPiQuestion(sessionId, question.text, Array.isArray(question.options) ? question.options.map(String) : undefined, signal);
          if (signal.aborted) return undefined;
          answers.push(`${question.text}: ${answer ?? "Skipped"}`);
        }
        return answers.join("\n") || "No valid questions provided";
      }
      if (call.name === "create_artifact" || call.name === "generate_interactive_answer") {
        const id = crypto.randomUUID();
        const artifact = call.name === "create_artifact" ? normalizeArtifact(call.arguments, id) : null;
        const interactive = call.name === "generate_interactive_answer" ? normalizeInteractiveAnswer(call.arguments, id) : null;
        if (artifact && !artifact.ok) throw new Error(artifact.error);
        if (interactive && !interactive.ok) throw new Error(interactive.error);
        onOutput({ id, type: "output", title: "Rich output", at: Date.now(), ...(artifact?.ok ? { artifact: artifact.artifact } : {}), ...(interactive?.ok ? { interactiveAnswer: interactive.answer } : {}) });
        return "Output attached to the conversation. Respond briefly without repeating it.";
      }
      const state = useExtensionsStore.getState();
      const resolved = resolveMcpTool(state.mcpServers, call.name);
      if (!resolved) throw new Error("Unknown tool");
      const capabilityId = mcpCapabilityId(resolved.server.id, resolved.toolName);
      if (projectId && state.policies[projectId]?.disabledCapabilityIds.includes(capabilityId)) throw new Error("Tool disabled for this project");
      const grant = findCapabilityGrant(state.grants, { serverId: resolved.server.id, capabilityId, projectId, chatId: scopeId, capabilityFingerprint: resolved.server.capabilityFingerprint });
      if (!grant) throw new Error("MCP permission required. Allow this capability in Settings > Extensions before retrying.");
      if (grant.usesRemaining !== undefined) state.consumeGrant(grant.id);
      const result = await invokeMcpTool(resolved.server, resolved.toolName, call.arguments);
      if (signal.aborted) return undefined;
      return JSON.stringify(result).slice(0, 60_000);
    } catch (error) { return `Tool failed: ${error instanceof Error ? error.message : String(error)}`; }
  } };
}
