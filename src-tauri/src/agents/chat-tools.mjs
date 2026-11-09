// Host tools use Pi's supported RPC extension UI request/response channel.
// Schemas come from Veyra; the host rechecks tool permissions before executing.
//
// Native Pi tools (bash, read, write, edit, grep, find, ls) never reach the
// host on their own, so the permission gate has to run here: Pi's `tool_call`
// event fires after its own `tool_execution_start` and strictly before the
// tool executes. Returning `{ block: true }` replaces the execution with an
// error tool result, which also gives the model clear feedback to continue.
//
// The gate is intentionally fail-closed: any transport problem, missing answer,
// unparsable answer, or unknown tool blocks the call.

/** Native tools that may be placed behind the permission gate. */
const GATED_NATIVE_TOOLS = new Set(["bash", "read", "write", "edit", "grep", "find", "ls"]);

/** Host-side request title that identifies a permission question. */
const PERMISSION_REQUEST_TITLE = "veyra_permission";

/** Host-side request title that identifies a Veyra-bridged tool call. */
const HOST_TOOL_REQUEST_TITLE = "veyra_tool";

function parseDecision(answer) {
  if (typeof answer !== "string" || !answer.trim()) return null;
  try {
    const parsed = JSON.parse(answer);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.outcome === "allow") return { outcome: "allow" };
    if (parsed.outcome === "deny") {
      return { outcome: "deny", reason: typeof parsed.reason === "string" ? parsed.reason : "" };
    }
    return null;
  } catch {
    return null;
  }
}

export default function (pi) {
  // Override after Pi assembles its prompt, including runtime metadata.
  if (process.env.VEYRA_REPLACE_SYSTEM_PROMPT === "1") {
    pi.on("before_agent_start", async () => ({ systemPrompt: process.env.VEYRA_SYSTEM_PROMPT ?? "" }));
  } else if (process.env.VEYRA_NO_PROJECT === "1") {
    // Pi's default prompt includes its process cwd even with --no-context-files.
    // A discussion without a project must never inherit that workspace metadata.
    pi.on("before_agent_start", async () => ({
      systemPrompt: `${process.env.VEYRA_SYSTEM_PROMPT ?? ""}\nYou are Veyra, a helpful assistant. No project is attached. There is no workspace or current folder for this conversation. Ask the user to attach a project when file access is needed.`,
    }));
  }
  const tools = JSON.parse(process.env.VEYRA_CHAT_TOOLS || "[]");
  for (const { function: tool } of tools) {
    pi.registerTool({
      name: tool.name, label: tool.name, description: tool.description,
      parameters: tool.parameters,
      async execute(toolCallId, args, signal, _update, ctx) {
        if (signal?.aborted) throw new Error("Cancelled");
        const response = await ctx.ui.input(HOST_TOOL_REQUEST_TITLE, JSON.stringify({ id: toolCallId, name: tool.name, arguments: args }));
        if (response === undefined) throw new Error("Tool request cancelled");
        return { content: [{ type: "text", text: response }], details: {} };
      },
    });
  }

  pi.on("tool_call", async (event, ctx) => {
    if (!GATED_NATIVE_TOOLS.has(event.toolName)) return undefined;
    // Nested calls (a tool calling another tool) arrive here too, with Pi's own
    // `<parent>/<n>` id. They are gated as well: an orchestrated Bash call must
    // not bypass the permission boundary.

    if (ctx.signal?.aborted) {
      return { block: true, reason: "The request was cancelled before this command could run." };
    }

    let answer;
    try {
      answer = await ctx.ui.input(
        PERMISSION_REQUEST_TITLE,
        JSON.stringify({
          id: event.toolCallId,
          name: event.toolName,
          arguments: event.input,
          cwd: ctx.cwd,
          parentToolCallId: event.parentToolCallId,
        }),
        ctx.signal ? { signal: ctx.signal } : undefined,
      );
    } catch {
      // An extension-side failure must never fall through to execution.
      return { block: true, reason: "Veyra could not confirm whether this command is allowed, so it was not run." };
    }

    const decision = parseDecision(answer);
    if (!decision) {
      return {
        block: true,
        reason: "Veyra did not confirm this command, so it was not run. Ask the user before retrying.",
      };
    }
    if (decision.outcome === "allow") return undefined;

    const reason = decision.reason.trim() || "The user denied this command.";
    return {
      block: true,
      reason: `Permission denied: ${reason}\nThe command did not run. Continue without it, or explain what you need and ask the user.`,
    };
  });
}
