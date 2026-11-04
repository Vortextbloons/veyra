// Host tools use Pi's supported RPC extension UI request/response channel.
// Schemas come from Veyra; the host rechecks tool permissions before executing.
export default function (pi) {
  const tools = JSON.parse(process.env.VEYRA_CHAT_TOOLS || "[]");
  for (const { function: tool } of tools) {
    pi.registerTool({
      name: tool.name, label: tool.name, description: tool.description,
      parameters: tool.parameters,
      async execute(toolCallId, args, signal, _update, ctx) {
        if (signal?.aborted) throw new Error("Cancelled");
        const response = await ctx.ui.input("veyra_tool", JSON.stringify({ id: toolCallId, name: tool.name, arguments: args }));
        if (response === undefined) throw new Error("Tool request cancelled");
        return { content: [{ type: "text", text: response }], details: {} };
      },
    });
  }
}
