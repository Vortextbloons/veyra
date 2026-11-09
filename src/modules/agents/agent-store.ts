import { useSettingsStore } from "@/stores/settings-store";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { contextTokensFromUsage, splitContextUsage } from "./context-usage";
import type { Conversation } from "@/modules/chat/chat-types";
import { createPiChatTools, loadableSkills } from "./pi-chat-tools";
import { buildSkillCataloguePrompt } from "@/lib/tool-registry";
import type { SkillInvocation } from "@/modules/extensions/extension-types";
import { useExtensionsStore } from "@/modules/extensions/extensions-store";
import { invocationsFor, useSkillsStore } from "@/modules/extensions/skills-store";
import { buildSkillPromptBlock } from "@/modules/extensions/skill-runtime";
import { usePermissionStore, enabledNativeToolsForChat } from "@/modules/permissions/permission-store";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  AgentEvent,
  AgentSession,
  AgentStatus,
  StartAgentSessionInput,
} from "@/modules/agents/agent-types";
import {
  checkPiAvailable,
  runPiAgent,
  stopPiAgent,
  steerPiAgent,
} from "@/modules/agents/pi-runtime";
import { asRecord } from "@/lib/utils";
import { notifyMemoryDeletion } from "@/modules/memory/memory-lifecycle";
import { useProjectStore } from "@/modules/projects/project-store";
import {
  agentPromptWithMemory,
  resolveAgentProjectId,
} from "./agent-session-context";

const sessionAbortControllers = new Map<string, AbortController>();
let startSessionChain: Promise<void> = Promise.resolve();

/**
 * Resolves a workspace to a project only after project hydration. Undefined is
 * the fail-closed result: the caller must not persist workspace facts globally.
 */
async function resolveHydratedAgentProjectId(projectPath: string): Promise<string | undefined> {
  if (!projectPath.trim()) return undefined;
  try {
    const projectStore = useProjectStore.getState();
    if (projectStore.hydrationState !== "ready") {
      await projectStore.hydrateProjects();
    }
    const hydrated = useProjectStore.getState();
    if (hydrated.hydrationState !== "ready") return undefined;
    return resolveAgentProjectId(projectPath, hydrated.projects);
  } catch {
    return undefined;
  }
}

async function isMemoryInjectionEnabled(): Promise<boolean> {
  try {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    return useMemoryStore.getState().enabled;
  } catch {
    return false;
  }
}

function abortAgentSession(sessionId: string): void {
  const controller = sessionAbortControllers.get(sessionId);
  controller?.abort();
  sessionAbortControllers.delete(sessionId);
  // A stopped chat must not leave approval cards for calls that can no longer run.
  usePermissionStore.getState().cancelSession(sessionId);
  void stopPiAgent(sessionId).catch(() => undefined);
}

type AgentStore = {
  sessions: AgentSession[];
  activeSessionId: string | null;
  runtimeAvailable: boolean | null;
  runtimeStatus: AgentStatus;
  projectPath: string;
  /** Workspace paths seen this install, including empty ones. */
  projects: string[];
  setProjectPath: (projectPath: string) => void;
  setActiveSessionId: (id: string | null) => void;
  checkRuntime: () => Promise<void>;
  loadProjectSessions: (projectPath: string) => Promise<void>;
  newSession: () => void;
  deleteSession: (sessionId: string) => Promise<void>;
  startSession: (input: StartAgentSessionInput) => Promise<string>;
  stopSession: (id: string) => void;
  steerSession: (id: string, text: string) => Promise<void>;
  clearSessions: () => void;
  importConversation: (conversation: Conversation, projectPath?: string) => void;
};

function titleFromPrompt(prompt: string) {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  return trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed || "Agent task";
}

function event(
  type: AgentEvent["type"],
  title: string,
  detail?: string,
  toolCallId?: string,
  sequence?: number,
): AgentEvent {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    detail,
    at: Date.now(),
    ...(sequence != null ? { sequence } : {}),
    ...(toolCallId ? { toolCallId } : {}),
  };
}

function stripAnsi(value: string) {
  const esc = String.fromCharCode(27);
  const bel = String.fromCharCode(7);
  return value
    .replace(new RegExp(`${esc}\\][^${bel}]*(?:${bel}|${esc}\\\\)`, "g"), "")
    .replace(new RegExp(`${esc}\\[[0-9;?]*[ -/]*[@-~]`, "g"), "")
    .replace(new RegExp(`${esc}[@-_]`, "g"), "")
    .trim();
}

function toolPreview(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 16_000 ? `${trimmed.slice(0, 16_000)}\n[Output truncated]` : trimmed;
}

function toolDetail(
  args: Record<string, unknown> | null,
  result: Record<string, unknown> | null,
  isError: boolean,
): string | undefined {
  const argParts: string[] = [];
  if (args) {
    for (const value of Object.values(args)) {
      if (typeof value === "string" && value.trim()) {
        argParts.push(toolPreview(value));
      }
    }
    if (argParts.length === 0 && Object.keys(args).length > 0) {
      argParts.push(toolPreview(JSON.stringify(args)));
    }
  }
  const resultParts: string[] = [];
  if (result) {
    const content = Array.isArray(result.content) ? result.content : [];
    const textBlocks = content.flatMap((block) => {
      const record = asRecord(block);
      return record?.type === "text" && typeof record.text === "string" ? [record.text] : [];
    });
    const output = typeof result.output === "string" ? result.output : textBlocks.join("\n");
    if (output) {
      resultParts.push(toolPreview(output));
    } else if (Object.keys(result).length > 0) {
      resultParts.push(toolPreview(JSON.stringify(result)));
    }
    if (isError) resultParts.push("error");
  }
  return [...argParts, ...resultParts].filter(Boolean).join("\n\n") || undefined;
}

function parseToolCallId(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.toolCallId,
    record.callId,
    record.call_id,
    record.tool_call_id,
    record.tool_use_id,
    record.toolUseId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function isPlaceholderToolDetail(detail?: string): boolean {
  const normalized = detail?.trim();
  return !normalized || normalized === "Running tool";
}

function parsePiEvent(raw: { stream: "stdout" | "stderr"; line: string; sequence: number }): AgentEvent | null {
  const line = raw.line.trim();
  if (!line) return null;

  if (raw.stream === "stderr") {
    return event("error", "Pi stderr", stripAnsi(line), undefined, raw.sequence);
  }

  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const type = typeof parsed.type === "string" ? parsed.type : "";

    switch (type) {
      case "agent_start":
        return null;

      case "turn_start":
        return null;

      case "message_update": {
        const assistantEvent = asRecord(parsed.assistantMessageEvent);
        if (!assistantEvent) return null;
        const eventType = typeof assistantEvent.type === "string" ? assistantEvent.type : "";

        if (eventType === "text_delta") {
          const delta = typeof assistantEvent.delta === "string" ? assistantEvent.delta : undefined;
          return delta ? event("output", "Pi stream", delta, undefined, raw.sequence) : null;
        }

        if (eventType === "text_end") {
          return null;
        }

        if (eventType === "thinking_delta") {
          const delta = typeof assistantEvent.delta === "string" ? assistantEvent.delta : undefined;
          return delta ? event("reasoning", "Reasoning", delta, undefined, raw.sequence) : null;
        }

        return null;
      }

      case "tool_execution_start": {
        const toolName = typeof parsed.toolName === "string" ? parsed.toolName : "tool";
        const toolCallId = parseToolCallId(parsed);
        const args = asRecord(parsed.args);
        return event("tool", toolName, toolDetail(args, null, false), toolCallId, raw.sequence);
      }

      case "tool_execution_update": {
        const toolName = typeof parsed.toolName === "string" ? parsed.toolName : "tool";
        const toolCallId = parseToolCallId(parsed);
        const partial = asRecord(parsed.partialResult);
        return event("tool", toolName, toolDetail(null, partial, false), toolCallId, raw.sequence);
      }

      case "tool_execution_end": {
        const toolName = typeof parsed.toolName === "string" ? parsed.toolName : "tool";
        const toolCallId = parseToolCallId(parsed);
        const result = asRecord(parsed.result);
        const isError = parsed.isError === true;
        return event("tool", toolName, toolDetail(null, result, isError), toolCallId, raw.sequence);
      }

      case "turn_end":
        return null;

      case "message_end": {
        const msg = asRecord(parsed.message);
        if (msg && typeof msg.role === "string" && msg.role === "assistant") {
          const usage = asRecord(msg.usage);
          if (usage && typeof usage.input === "number") {
            return { ...event("token_update", "Token update", String(contextTokensFromUsage(usage)), undefined, raw.sequence), contextUsage: splitContextUsage(usage) };
          }
        }
        return null;
      }

      case "agent_end":
        return event("result", "Completed", undefined, undefined, raw.sequence);

      default:
        return null;
    }
  } catch {
    return event("status", "Pi event", line.startsWith("{") ? undefined : stripAnsi(line), undefined, raw.sequence);
  }
}

function modelDetail(model: string) {
  const trimmed = model.trim();
  if (!trimmed) return "Pi model: default";
  const normalized = trimmed.replace(/[\\/]+$/, "");
  const [provider, modelId] = normalized.split("/");
  if (!provider || !modelId) {
    return `Pi model: lmstudio/${normalized}`;
  }
  return `Pi model: ${normalized}`;
}

function patchSession(
  sessions: AgentSession[],
  id: string,
  patch: Partial<AgentSession>,
) {
  return sessions.map((session) =>
    session.id === id ? { ...session, ...patch } : session,
  );
}

function appendLiveOutput(events: AgentEvent[], nextEvent: AgentEvent): AgentEvent[] {
  const baseEvents = events;

  // Merge only back-to-back reasoning deltas so tool/output blocks stay in order.
  if (nextEvent.type === "reasoning" && nextEvent.title === "Reasoning") {
    const last = baseEvents.at(-1);
    if (last?.type === "reasoning" && last.title === "Reasoning") {
      const currentText = last.detail ?? "";
      const nextText = nextEvent.detail ?? "";
      const detail = nextText.startsWith(currentText)
        ? nextText
        : [currentText, nextText].filter(Boolean).join("");
      const updated = baseEvents.slice();
      updated[updated.length - 1] = { ...last, detail, at: nextEvent.at };
      return updated;
    }
    return [...baseEvents, nextEvent];
  }

  // Merge tool events so each call stays in one slot.
  if (nextEvent.type === "tool") {
    if (nextEvent.toolCallId) {
      const existingIndex = baseEvents.findLastIndex(
        (item) => item.type === "tool" && item.toolCallId === nextEvent.toolCallId,
      );
      if (existingIndex !== -1) {
        const current = baseEvents[existingIndex];
        const updated = baseEvents.slice();
        updated[existingIndex] = {
          ...current,
          ...nextEvent,
          title: nextEvent.title || current.title,
          detail: nextEvent.detail?.trim() ? nextEvent.detail : current.detail,
          at: nextEvent.at,
          toolCallId: current.toolCallId ?? nextEvent.toolCallId,
        };
        return updated.filter(
          (item, index) =>
            index === existingIndex ||
            item.type !== "tool" ||
            item.toolCallId !== nextEvent.toolCallId,
        );
      }
    } else {
      const last = baseEvents.at(-1);
      if (
        last?.type === "tool" &&
        last.title === nextEvent.title &&
        (isPlaceholderToolDetail(last.detail) ||
          isPlaceholderToolDetail(nextEvent.detail) ||
          (last.detail?.trim() ?? "") === (nextEvent.detail?.trim() ?? ""))
      ) {
        const updated = baseEvents.slice();
        updated[updated.length - 1] = {
          ...last,
          ...nextEvent,
          title: nextEvent.title || last.title,
          detail: nextEvent.detail?.trim() ? nextEvent.detail : last.detail,
          at: nextEvent.at,
        };
        return updated;
      }
    }

    return [...baseEvents, nextEvent];
  }

  if (!nextEvent.detail) {
    return [...baseEvents, nextEvent];
  }

  if (nextEvent.type !== "output" || nextEvent.title !== "Pi stream") {
    return [...baseEvents, nextEvent];
  }

  const last = baseEvents.at(-1);
  if (last?.type === "output" && last.title === "Pi stream") {
    const currentText = last.detail ?? "";
    const nextText = nextEvent.detail;
    const detail = nextText.startsWith(currentText)
      ? nextText
      : [currentText, nextText].filter(Boolean).join("");
    const updated = baseEvents.slice();
    updated[updated.length - 1] = { ...last, detail, at: nextEvent.at };
    return updated;
  }

  return [...baseEvents, nextEvent];
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      runtimeAvailable: null,
      runtimeStatus: "idle",
      projectPath: "",
      projects: [],
      setProjectPath: (projectPath) => {
        const path = projectPath.trim();
        set((state) => {
          const active = state.sessions.find((session) => session.id === state.activeSessionId);
          const attachToDiscussion = active && !active.projectPath && path && active.status !== "running";
          return {
          projectPath: path,
          projects: [...new Set([...state.projects, path])],
          activeSessionId: attachToDiscussion ? active.id : state.sessions.find((session) => session.projectPath.trim() === path)?.id ?? null,
          sessions: attachToDiscussion ? patchSession(state.sessions, active.id, { projectPath: path, projectId: useProjectStore.getState().activeProjectId ?? undefined }) : state.sessions,
        }; });
      },
      setActiveSessionId: (activeSessionId) => {
        const session = activeSessionId
          ? get().sessions.find((item) => item.id === activeSessionId)
          : null;
        set({
          activeSessionId,
          ...(session
            ? {
                projectPath: session.projectPath,
              }
            : {}),
        });
        if (session) {
          useProjectStore.getState().setActiveProjectId(session.projectId ?? null);
        }
      },
      checkRuntime: async () => {
        set({ runtimeStatus: "checking_runtime" });
        const available = await checkPiAvailable();
        set({ runtimeAvailable: available, runtimeStatus: available ? "idle" : "failed" });
      },
      loadProjectSessions: async (projectPath) => {
        set((state) => {
          const projectKey = projectPath.trim();
          const visibleSessions = state.sessions.filter(
            (session) =>
              session.projectPath.trim() === projectKey,
          );
          const activeSessionId = state.activeSessionId === null ? null : visibleSessions.some((session) => session.id === state.activeSessionId)
            ? state.activeSessionId
            : visibleSessions[0]?.id ?? null;
          return {
            projectPath,
            activeSessionId,
          };
        });
      },
      newSession: () => set({ activeSessionId: null }),
      importConversation: (conversation, projectPath = "") => {
        const existing = get().sessions.find((session) => (session.sourceConversationId ?? session.id) === conversation.id);
        if (existing) {
          get().setActiveSessionId(existing.id);
          return;
        }
        const id = crypto.randomUUID();
        const imported: AgentSession = {
          id, sourceConversationId: conversation.id, projectId: conversation.projectId, runtime: "pi", mode: "chat", status: "ready",
          projectPath, prompt: "", model: "", title: conversation.title, startedAt: conversation.createdAt,
          events: conversation.messages.filter((message) => message.role === "user" || message.role === "assistant").map((message) => ({
            id: message.id, type: message.role === "user" ? "status" : "output",
            title: message.role === "user" ? "Prompt" : "Pi", detail: message.content, at: message.timestamp, attachments: message.attachments, skillInvocations: message.skillInvocations, artifact: message.artifact, interactiveAnswer: message.interactiveAnswer,
          })),
        };
        set((state) => ({ sessions: [imported, ...state.sessions], activeSessionId: id, projectPath }));
        useProjectStore.getState().setActiveProjectId(conversation.projectId ?? null);
      },
      deleteSession: async (sessionId) => {
        const current = get().sessions.find((session) => session.id === sessionId);
        if (!current) return;
        notifyMemoryDeletion({ sourceType: "agent", sourceId: sessionId });
        usePermissionStore.getState().cancelSession(sessionId);
        if (current.status === "running") {
          abortAgentSession(sessionId);
        }
        set((state) => {
          const sessions = state.sessions.filter((session) => session.id !== sessionId);
          const deletedProject = current.projectPath.trim();
          const activeSessionId = state.activeSessionId === sessionId
            ? sessions.find((session) => session.projectPath.trim() === deletedProject)?.id ?? null
            : state.activeSessionId;
          const activeSession = activeSessionId
            ? sessions.find((session) => session.id === activeSessionId)
            : null;
          return {
            sessions,
            activeSessionId,
            ...(activeSession
              ? { projectPath: activeSession.projectPath }
              : {}),
          };
        });
      },
      startSession: async (input) => {
    const userPrompt = input.prompt.trim();
    const selectedModel = input.model;
    const providerId = input.providerId ?? "";
    const waitFor = startSessionChain;
    let unlock: () => void = () => {};
    startSessionChain = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await waitFor;

    try {
      const requestedProjectPath = input.projectPath.trim();
      if (
        get().sessions.some(
          (session) => session.status === "running" && session.projectPath.trim() === requestedProjectPath,
        )
      ) {
        const running = get().sessions.find(
          (session) => session.status === "running" && session.projectPath.trim() === requestedProjectPath,
        );
        return running?.id ?? "";
      }

      const targetSessionId = input.continueSessionId === undefined ? get().activeSessionId : input.continueSessionId;
      const activeSession = targetSessionId
        ? get().sessions.find(
            (item) => item.id === targetSessionId && item.projectPath.trim() === requestedProjectPath,
          )
        : null;
      const activeProjectPath = activeSession?.projectPath.trim() ?? "";
      const projectPath = activeSession && requestedProjectPath === "" ? activeProjectPath : requestedProjectPath;
      const mode = "chat";
      const shouldContinue = Boolean(
        activeSession &&
          activeSession.status !== "running" &&
          activeProjectPath === projectPath,
      );
      const id = shouldContinue && activeSession ? activeSession.id : crypto.randomUUID();
      const turnId = crypto.randomUUID();
      // Capture project scope once; later navigation must not change this turn.
      const scopeProjectId = input.projectId === null ? undefined : input.projectId ?? activeSession?.projectId ?? await resolveHydratedAgentProjectId(projectPath);
      // A nonempty workspace that does not resolve to exactly one project must
      // not fall back to global personal memory for extraction.
      const mayExtractAgentMemory = !projectPath.trim() || scopeProjectId !== undefined;
      const now = Date.now();
      const messageId = crypto.randomUUID();
      // Skills come from the composer's one-request picks plus anything pinned to
      // this chat. `retrySkillInvocations` replays a stored record instead so a
      // retry repeats the original instructions even after an edit or delete.
      const skillsState = useSkillsStore.getState();
      const scopeId = shouldContinue && activeSession ? activeSession.id : "new-chat";
      const invocations = input.retrySkillInvocations ?? input.skillInvocations
        ?? (skillsState.skillsEnabled
          ? invocationsFor(skillsState.skills, skillsState.chatSkillIds[scopeId] ?? [], skillsState.pendingTurnSkillIds[scopeId] ?? [])
          : []);
      const session: AgentSession = {
        id,
        runtime: "pi",
        mode,
        status: "running",
        projectPath,
        projectId: scopeProjectId,
        prompt: userPrompt,
        model: selectedModel,
        title: titleFromPrompt(userPrompt),
        startedAt: now,
        events: [
          ...(shouldContinue && activeSession ? activeSession.events : []),
          event(
            "status",
            shouldContinue ? "Message sent" : "Session started",
            [
              projectPath ? `Workspace: ${projectPath}` : null,
              modelDetail(selectedModel),
            ]
              .filter(Boolean)
              .join("\n") || undefined,
          ),
          { ...event("status", "Prompt", input.displayPrompt || userPrompt), id: messageId, attachments: input.attachments, skillInvocations: invocations.length ? invocations : undefined },
        ],
      };

      set((state) => ({
        sessions: shouldContinue
          ? patchSession(state.sessions, id, {
              status: "running",
              prompt: userPrompt,
              mode,
              projectPath,
              projectId: scopeProjectId,
              model: selectedModel,
              events: session.events,
              exitCode: undefined,
              endedAt: undefined,
            })
          : [session, ...state.sessions],
        ...(state.projectPath.trim() === projectPath ? { activeSessionId: id } : {}),
      }));

      // The request now carries its own record, so the composer's one-request
      // pick is spent. Clearing here means a later failure cannot leave a stale
      // selection silently applying to the next message.
      const sentSkills = useSkillsStore.getState();
      if (scopeId === "new-chat") {
        const pinned = sentSkills.chatSkillIds[scopeId] ?? [];
        if (pinned.length) sentSkills.setChatSkills(id, pinned);
      }
      sentSkills.clearPendingTurnSkills(scopeId);
      if (scopeId === "new-chat") {
        useExtensionsStore.setState((state) => ({
          chatDisabledMcpServerIds: { ...state.chatDisabledMcpServerIds, [id]: state.chatDisabledMcpServerIds[scopeId] ?? [] },
          chatEnabledMcpServerIds: { ...state.chatEnabledMcpServerIds, [id]: state.chatEnabledMcpServerIds[scopeId] ?? [] },
        }));
      }

      try {
        const abortController = new AbortController();
        sessionAbortControllers.set(id, abortController);
        // A new turn cannot inherit an approval card from the previous one.
        usePermissionStore.getState().cancelSession(id);
        // Skills the model loads during this run, appended to the request record.
        const loadedByModel: SkillInvocation[] = [];
        try {
          let memoryBlock = "";
          if (!input.replaceSystemPrompt) try {
            const { retrieveMemoryContext } = await import("@/modules/memory/memory-service");
            const retrieved = await retrieveMemoryContext({
              query: userPrompt,
              projectId: scopeProjectId,
              signal: abortController.signal,
            });
            memoryBlock = retrieved.block;
          } catch {
            // Memory is optional; retrieval failures must not block the agent run.
          }
          if (abortController.signal.aborted) return id;

          // Retrieval may have happened while memory was enabled. Re-check the
          // live global switch immediately before dispatch so a stale snapshot
          // cannot be injected after the user turns memory off.
          if (memoryBlock && !(await isMemoryInjectionEnabled())) {
            memoryBlock = "";
          }
          if (abortController.signal.aborted) return id;

          const bridge = createPiChatTools({ sessionId: id, scopeId, projectId: scopeProjectId, webSearchEnabled: input.webSearchEnabled ?? false, cwd: projectPath, signal: abortController.signal, onOutput: (output) => {
            if (abortController.signal.aborted) return;
            set((state) => {
              const current = state.sessions.find((item) => item.id === id);
              return current ? { sessions: patchSession(state.sessions, id, { events: [...current.events, output] }) } : state;
            });
          }, onSkillUsed: (invocation) => {
            // Append to the request's record so the turn shows what the model
            // chose to load, and a retry replays it.
            loadedByModel.push(invocation);
            set((state) => ({
              sessions: state.sessions.map((session) => session.id !== id ? session : {
                ...session,
                events: session.events.map((event) => event.id !== messageId ? event : {
                  ...event,
                  skillInvocations: [...invocations, ...loadedByModel],
                }),
              }),
            }));
            // Make the supporting files reachable for this run without pruning the
            // session's explicit Skills.
            const record = useSkillsStore.getState().skills.find((item) => item.id === invocation.id);
            void invoke("materialize_pi_skills", {
              prune: false,
              skills: [{ name: invocation.name, slug: invocation.slug, description: record?.description ?? "", instructions: invocation.instructions, snapshotId: record?.snapshotId }],
            }).catch(() => undefined);
          } });
          const project = scopeProjectId ? useProjectStore.getState().projects.find((item) => item.id === scopeProjectId) : undefined;
          let skillPaths: string[] = [];
          let promptInvocations = invocations;
          if (invocations.length && !input.replaceSystemPrompt) {
            try {
              const materialized = await invoke<{ path: string; name: string }[]>("materialize_pi_skills", {
                skills: invocations.map((invocation) => {
                  const current = skillsState.skills.find((skill) => skill.id === invocation.id);
                  return {
                    name: invocation.name,
                    slug: invocation.slug,
                    // A deleted Skill still has its recorded instructions, so the
                    // retry works; the description is only routing metadata Pi
                    // does not use for an explicitly selected Skill.
                    description: current?.description || `Recorded Skill ${invocation.name}`,
                    instructions: invocation.instructions,
                    snapshotId: current?.snapshotId,
                  };
                }),
              });
              skillPaths = materialized.map((item) => item.path);
              // Record where each Skill's files live so the model can resolve
              // relative references through Pi's own read tool.
              promptInvocations = invocations.map((invocation) => ({
                ...invocation,
                location: materialized.find((item) => item.name === invocation.slug)?.path,
              }));
            } catch {
              // Pi runs without Skills rather than failing the whole request.
              skillPaths = [];
            }
          }
          // The recorded instructions are sent with the request; `--skill` gives
          // the model a resolvable directory for supporting files.
          const skillBlock = buildSkillPromptBlock(promptInvocations);
          // Advertise Skills the model can load on its own. Only the name and
          // description go in the prompt; the instructions arrive through the
          // `use_skill` tool when the model decides they apply.
          const loadable = loadableSkills(scopeProjectId).filter(
            (skill) => !invocations.some((invocation) => invocation.id === skill.id),
          );
          const catalogue = buildSkillCataloguePrompt(loadable);
          const contextualPrompt = input.replaceSystemPrompt ? userPrompt : [
            project?.systemPrompt ? `Project guidance:\n${project.systemPrompt}` : "",
            skillBlock,
            catalogue,
            userPrompt,
          ].filter(Boolean).join("\n\n");
          const result = await runPiAgent(
            {
              sessionId: id,
              projectPath,
              prompt: agentPromptWithMemory(contextualPrompt, input.replaceSystemPrompt ? "" : memoryBlock, {
                session: shouldContinue ? activeSession ?? null : null,
                contextLength: input.contextLength,
                reservedOutputTokens: input.reservedOutputTokens,

              }),
              model: selectedModel,
              contextLength: input.contextLength,
              reservedOutputTokens: input.reservedOutputTokens,
              maxTokens: useSettingsStore.getState().getModelSettings(input.model).maxTokens,
              providerId: input.providerId,
              providerBaseUrl: input.providerBaseUrl,
              reasoningEnabled: input.reasoningEnabled,
              reasoningLevel: input.reasoningLevel,
              images: input.images,
              tools: bridge.tools,
              skillPaths,
              systemPrompt: input.systemPrompt,
              replaceSystemPrompt: input.replaceSystemPrompt,
              // Built-in tools this chat switched on. The Rust side also
              // filters against its own allowlist, so a stale caller cannot
              // introduce a capability by naming it.
              nativeTools: enabledNativeToolsForChat(id),
            },
            (rawEvent) => {
              const parsedEvent = parsePiEvent(rawEvent);
              if (!parsedEvent) return;
              if (parsedEvent.type === "token_update") {
                const tokens = parseInt(parsedEvent.detail ?? "0", 10);
                if (Number.isFinite(tokens) && tokens >= 0) {
                  set((state) => {
                    const current = state.sessions.find((item) => item.id === id);
                    if (!current || current.status !== "running") return state;
                    return {
                      sessions: patchSession(state.sessions, id, {
                        contextTokens: tokens,
                        contextUsage: parsedEvent.contextUsage,
                      }),
                    };
                  });
                }
                return;
              }
              set((state) => {
                const current = state.sessions.find((item) => item.id === id);
                if (!current || current.status !== "running") return state;
                return {
                  sessions: patchSession(state.sessions, id, {
                    events: appendLiveOutput(current.events, parsedEvent),
                  }),
                };
              });
            },
            { signal: abortController.signal, onUiRequest: bridge.handle },
          );

          const currentSession = get().sessions.find((item) => item.id === id);
          if (currentSession?.status === "stopped" || abortController.signal.aborted) {
            return id;
          }
          // The run is over, so nothing can still be waiting on a decision.
          usePermissionStore.getState().cancelSession(id);

          const failed = result.exitCode !== 0;
          const stderrText = stripAnsi(result.stderr);
          const currentSessionEvents = get().sessions.find((item) => item.id === id);
          const currentEvents = currentSessionEvents?.events ?? [];
          const events = [
            ...currentEvents,
            ...(stderrText
              ? [event(failed ? "error" : "output", "Pi stderr", stderrText)]
              : []),
            event(
              failed ? "error" : "result",
              failed ? "Turn failed" : "Turn completed",
              failed ? `Exit code: ${result.exitCode ?? "unknown"}` : undefined,
            ),
          ];
          set((state) => ({
            sessions: patchSession(state.sessions, id, {
              status: failed ? "failed" : "ready",
              summary: failed ? "Pi could not complete the turn." : undefined,
              endedAt: Date.now(),
              exitCode: failed ? result.exitCode : undefined,
              events,
            }),
          }));

          if (!failed && mayExtractAgentMemory) {
            try {
              const { queueMemoryExtraction } = await import("@/modules/memory/memory-service");
              // Only the user's prompt is durable memory here. Pi stdout, tool
              // output, and reasoning are never promoted into memory.
              queueMemoryExtraction({
                sourceType: "agent",
                sourceId: id,
                turnId,
                userText: userPrompt,
                assistantText: "",
                projectId: scopeProjectId,
                model: selectedModel,
                providerId,
              });
            } catch {
              // Memory extraction is best-effort and never changes agent results.
            }
          }
        } finally {
          // Cancellation during retrieval used to leave a stale controller in
          // the map. Always release this run's entry, but never a newer one.
          if (sessionAbortControllers.get(id) === abortController) {
            sessionAbortControllers.delete(id);
          }
        }
      } catch (error) {
        const current = get().sessions.find((item) => item.id === id);
        if (current?.status === "stopped") {
          return id;
        }
        const message = error instanceof Error ? error.message : String(error);
        set((state) => {
          const failedSession = state.sessions.find((item) => item.id === id);
          if (failedSession?.status === "stopped") return state;
          return {
            runtimeAvailable: state.runtimeAvailable,
            sessions: patchSession(state.sessions, id, {
              status: "failed",
              summary: "Pi could not complete the task.",
              endedAt: Date.now(),
              events: [
                ...(failedSession?.events ?? []),
                event("error", "Failed to run Pi", message),
              ],
            }),
          };
        });
      }

      return id;
    } finally {
      unlock();
    }
      },
      steerSession: async (id, text) => {
        const message = text.trim();
        if (!message || !get().sessions.some((session) => session.id === id && session.status === "running")) {
          throw new Error("Chat is no longer running");
        }
        await steerPiAgent(id, message);
        set((state) => ({ sessions: state.sessions.map((session) => session.id === id
          ? { ...session, events: [...session.events, event("status", "Prompt", message)] }
          : session) }));
      },
      stopSession: (id) => {
        abortAgentSession(id);
        set((state) => {
          const current = state.sessions.find((item) => item.id === id);
          if (!current || current.status !== "running") return state;
          return {
            sessions: patchSession(state.sessions, id, {
              status: "stopped",
              endedAt: Date.now(),
              events: [...current.events, event("status", "Session stopped")],
            }),
          };
        });
      },
      clearSessions: () => {
        for (const session of get().sessions) {
          notifyMemoryDeletion({ sourceType: "agent", sourceId: session.id });
          if (session.status === "running") {
            abortAgentSession(session.id);
          }
        }
        set({ sessions: [], activeSessionId: null });
      },
    }),
    {
      name: "veyra-agent-store",
      storage: createJSONStorage(() => localStorage),
      // Session transcripts live in the encrypted conversation snapshot
      // (see pi-conversation-storage.ts). Persisting them here as well would
      // rewrite every transcript on each streamed event and create a second
      // copy of the same history.
      partialize: (state) => ({
        activeSessionId: state.sessions.some(
          (session) => session.id === state.activeSessionId && session.status !== "running",
        )
          ? state.activeSessionId
          : null,
        projectPath: state.projectPath,
        projects: state.projects,
      }),
    },
  ),
);
