import { runJavaScript } from "@/lib/code-execution/runner";
import type { ProviderToolCall } from "@/lib/providers/types";
import { buildProviderTools, buildUseSkillTool, USE_SKILL_TOOL_NAME } from "@/lib/tool-registry";
import { runSearch, buildSearchContextBlock, resolveSearchContextTokenLimit } from "@/modules/web-search/orchestrator/SearchOrchestrator";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useExtensionsStore, findCapabilityGrant } from "@/modules/extensions/extensions-store";
import { buildMcpProviderTools, invokeMcpTool, mcpCapabilityId, resolveMcpTool } from "@/modules/extensions/mcp-tool-adapter";
import { normalizeArtifact } from "@/modules/chat/artifact";
import type { AgentEvent } from "./agent-types";
import { askPiQuestion } from "./pi-questions";
import { useSettingsStore } from "@/stores/settings-store";
import { useSkillsStore } from "@/modules/extensions/skills-store";
import type { SkillInvocation, SkillRecord } from "@/modules/extensions/extension-types";
import { buildSkillPromptBlock, isModelInvocable, modelInvocableSkills } from "@/modules/extensions/skill-runtime";
import { usePermissionStore } from "@/modules/permissions/permission-store";
import { PERMISSION_REQUEST_TITLE } from "./permission-request";

/**
 * Answer a native-tool permission question from Pi.
 *
 * Pi is blocked inside `tool_call` until this returns, so every path produces
 * a JSON decision. Anything unparsable is a denial: the safe direction when the
 * host cannot describe what is being asked.
 */
async function respondToPermissionRequest(
  request: Record<string, unknown>,
  context: { sessionId: string; cwd?: string; signal: AbortSignal },
): Promise<string> {
  let payload: { id?: unknown; name?: unknown; arguments?: unknown; cwd?: unknown } = {};
  try {
    payload = JSON.parse(String(request.placeholder ?? "{}")) as typeof payload;
  } catch {
    return JSON.stringify({ outcome: "deny", reason: "Veyra could not read the command details." });
  }
  const toolName = typeof payload.name === "string" ? payload.name : "";
  const toolCallId = typeof payload.id === "string" ? payload.id : "";
  const args = payload.arguments && typeof payload.arguments === "object" && !Array.isArray(payload.arguments)
    ? payload.arguments as Record<string, unknown>
    : null;
  if (!toolName || !toolCallId || !args) {
    return JSON.stringify({ outcome: "deny", reason: "Veyra could not read the command details." });
  }
  if (context.signal.aborted) {
    return JSON.stringify({ outcome: "deny", reason: "The request was cancelled." });
  }

  const decision = await usePermissionStore.getState().authorize(
    {
      sessionId: context.sessionId,
      toolCallId,
      toolName,
      args,
      cwd: typeof payload.cwd === "string" && payload.cwd ? payload.cwd : context.cwd ?? "",
      bridge: "native",
    },
    context.signal,
  );
  return decision.outcome === "allow"
    ? JSON.stringify({ outcome: "allow" })
    : JSON.stringify({ outcome: "deny", reason: decision.reason });
}

/**
 * Gate a Veyra-bridged tool. Returns the text the model should see when the
 * call was denied, or undefined when execution may continue.
 */
async function authorizeHostTool(input: {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  cwd: string;
  signal: AbortSignal;
}): Promise<string | undefined> {
  const decision = await usePermissionStore.getState().authorize(
    {
      sessionId: input.sessionId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      args: input.args,
      cwd: input.cwd,
      bridge: "host",
    },
    input.signal,
  );
  if (decision.outcome === "allow") return undefined;
  // A denial is normal tool feedback: the assistant can explain it and continue.
  return `Tool failed: ${decision.reason}`;
}

/**
 * Skills the model may load on its own for this request.
 *
 * Three things must hold: Skills are enabled, the Skill is model-invocable under
 * the current default and any per-Skill override, and it is allowed in this
 * project. A Skill that fails the model check is still usable by the user from
 * the composer.
 */
export function loadableSkills(projectId?: string): SkillRecord[] {
  const state = useSkillsStore.getState();
  if (!state.skillsEnabled) return [];
  const policy = projectId ? useExtensionsStore.getState().policies[projectId] : undefined;
  const allowedInProject = state.skills.filter((skill) =>
    !projectId || !policy || policy.enabledSkillIds.length === 0 || policy.enabledSkillIds.includes(skill.id),
  );
  return modelInvocableSkills(allowedInProject, state.modelInvocationDefault);
}

export function createPiChatTools(options: {
  sessionId: string;
  scopeId: string;
  projectId?: string;
  webSearchEnabled: boolean;
  signal: AbortSignal;
  onOutput: (event: AgentEvent) => void;
  /** Working directory Pi reported for this run; the gate binds approvals to it. */
  cwd?: string;
  /** Called when the model loads a Skill, so the request can record it. */
  onSkillUsed?: (invocation: SkillInvocation) => void;
}) {
  const { sessionId, scopeId, projectId, signal, onOutput } = options;
  // Captured once per request: the model sees the catalogue it can actually load.
  const skills = loadableSkills(projectId);
  const skillsBySlug = new Map(skills.map((skill) => [skill.slug, skill]));
  const toolsNow = () => {
    const state = useExtensionsStore.getState();
    const policy = projectId ? state.policies[projectId] : undefined;
    const servers = state.mcpServers.filter((server) => (!server.projectIds.length || Boolean(projectId && server.projectIds.includes(projectId))) && (!policy?.enabledMcpServerIds.length || policy.enabledMcpServerIds.includes(server.id)));
    const useSkillTool = buildUseSkillTool(skills);
    return [...buildProviderTools({ webSearchEnabled: options.webSearchEnabled && useConnectivityStore.getState().effectiveConnectivity === "online", codeExecutionEnabled: useSettingsStore.getState().codeExecutionEnabled, enhancedMode: true, interactiveAnswersEnabled: useSettingsStore.getState().interactiveAnswersEnabled, artifactsEnabled: useSettingsStore.getState().artifactsEnabled }).filter((tool) => tool.function.name !== "scratchpad_write"),
      ...(useSkillTool ? [useSkillTool] : []),
      ...buildMcpProviderTools(servers, projectId, state.featureFlags, state.chatDisabledMcpServerIds[scopeId], state.chatEnabledMcpServerIds[scopeId]).filter((tool) => !policy?.disabledCapabilityIds.includes(tool.function.name))];
  };
  const tools = toolsNow();
  return { tools, async handle(request: Record<string, unknown>): Promise<string | undefined> {
    if (signal.aborted) return undefined;

    // A native Pi tool reached the permission boundary. Pi blocks execution
    // until this answer arrives, so the reply must always be a decision.
    if (request.title === PERMISSION_REQUEST_TITLE) {
      return respondToPermissionRequest(request, { sessionId, cwd: options.cwd, signal });
    }

    if (request.title !== "veyra_tool") {
      return askPiQuestion(sessionId, String(request.title ?? "Question"), request.method === "confirm" ? ["true", "false"] : Array.isArray(request.options) ? request.options.map(String) : undefined, signal);
    }
    try {
      const call = JSON.parse(String(request.placeholder)) as ProviderToolCall;
      if (!tools.some((tool) => tool.function.name === call.name) || !toolsNow().some((tool) => tool.function.name === call.name)) throw new Error("This tool is no longer enabled.");
      if (!call.arguments || typeof call.arguments !== "object") throw new Error("Invalid tool arguments");
      // Enablement above stays authoritative: Full access in the permission
      // gate never turns on a tool the user disabled.
      const gate = await authorizeHostTool({ sessionId, toolCallId: call.id, toolName: call.name, args: call.arguments, cwd: options.cwd ?? "", signal });
      if (gate) return gate;
      if (call.name === "code_execution") {
        if (!useSettingsStore.getState().codeExecutionEnabled) throw new Error("Code execution is no longer enabled.");
        return JSON.stringify(await runJavaScript(call.arguments, signal));
      }
      if (call.name === USE_SKILL_TOOL_NAME) {
        const slug = String(call.arguments.name ?? "").trim();
        const skill = skillsBySlug.get(slug);
        if (!skill) throw new Error(`Unknown Skill: ${slug || "(none given)"}`);
        // Re-check access: the user may have disabled the Skill or revoked model
        // access while this request was running.
        const current = useSkillsStore.getState();
        const live = current.skills.find((item) => item.id === skill.id);
        if (!live?.enabled) throw new Error(`The Skill “${skill.name}” is disabled.`);
        if (!isModelInvocable(live, current.modelInvocationDefault)) {
          throw new Error(`The Skill “${skill.name}” is set to manual use only. Ask the user to apply it.`);
        }
        const invocation = {
          id: live.id,
          name: live.name,
          slug: live.slug,
          contentHash: live.contentHash,
          instructions: live.instructions,
          scope: "turn" as const,
        };
        options.onSkillUsed?.(invocation);
        // The block carries the same framing an explicitly applied Skill gets, so
        // a loaded Skill cannot gain authority it would not otherwise have.
        return buildSkillPromptBlock([invocation]);
      }
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
        const interactive =
          call.name === "generate_interactive_answer"
            ? (await import("@/modules/chat/interactive-answer")).normalizeInteractiveAnswer(call.arguments, id)
            : null;
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
