# Chat Tools

Pi asks Veyra to run a tool. The frontend holds the tool definitions and does
the execution, so no tool code runs inside the Pi process.

## Registered Tools

| Tool | Condition | Description |
|------|-----------|-------------|
| `code_execution` | code execution enabled | Runs synchronous JavaScript in a local WebAssembly sandbox with supplied input |
| `web_search` | web search enabled **and** connectivity is online | Runs the bundled search orchestrator and returns a context block |
| `ask_question` | interactive answers enabled | Asks the user one or more questions and returns their answers |
| `create_artifact` | artifacts enabled | Attaches an HTML, code, or document artifact to the conversation |
| `generate_interactive_answer` | interactive answers enabled | Attaches a live UI page: the model writes an OpenUI Lang program that Veyra renders with its own component library |
| `mcp_*` | server connected, chat-enabled, grant present | Proxied MCP tool calls, capped at 60 KB of output |

`scratchpad_write` is filtered out of the Pi tool list. Code execution follows
the persisted Settings > Tools switch and the existing host permission gate.
See [Code execution](../code-execution/01-overview.md) for file workflows and limits.

## How Tools Reach Pi

`src/modules/agents/pi-chat-tools.ts` builds the tool list with
`buildProviderTools` (plus `buildMcpProviderTools`) and hands it to the Pi
runner. Pi's tool request arrives as a prompt whose title is `veyra_tool` and
whose placeholder is the JSON tool call:

1. Re-validate that the tool is still enabled in the current scope.
2. Dispatch by name (`web_search`, `ask_question`, artifacts, MCP).
3. Return the result as text, or a `Tool failed: …` string the model can react to.
4. Emit an `AgentEvent` for artifacts and interactive answers so the turn renders them.

## Interactive Answers

`generate_interactive_answer` takes one `program` string: an
[OpenUI Lang](https://www.openui.com) document the model writes with the
component library in `src/modules/chat/ui/`. The program is not a template — it
arranges primitives (`Col`, `Row`, `Card`, `Chart`, `Table`, `Slider`, `Svg`, …),
holds its own state in `$variables`, and computes what it shows with `@`
functions, so the answer keeps working without another message.

- `src/modules/chat/ui/library.ts` registers the components, functions and
  actions, and compiles them into the system prompt (`getInteractiveAnswerPrompt`).
  `src/lib/prompts.ts` appends that prompt only when the tool is enabled.
- `src/modules/chat/ui/validate.ts` parses the program before it is stored.
  Unknown components, undefined references, unreferenced statements and
  truncated output are rejected, and the reason goes back to the model as a
  tool error so it can repair the program.
- `src/modules/chat/interactive-answer.ts` normalizes the payload
  (`{ version: 2, id, title?, program }`) and size-checks it.
- `src/modules/chat/components/interactive-answer-block.tsx` renders it with
  `<Renderer>` and routes actions: `@ToAssistant` becomes a follow-up message
  (with form values), `@OpenUrl` opens the system browser, `@CopyToClipboard`
  copies, and `@Set` / `@Reset` are applied by the renderer itself.

The prompt is about 7.5k tokens. Local models need a context window large
enough for it (LM Studio defaults to 4k, which truncates the prompt and breaks
the output); raise the model's context length before enabling the feature.

## Permissions

- Project policy can disable a capability id outright.
- MCP calls need a `CapabilityGrant` scoped to server, project, chat, and the
  server's capability fingerprint. Destructive tools consume a one-time grant.
- A missing grant fails the call with instructions instead of prompting silently.

## Rendering

Tool activity is rendered from the session event log: `AgentActivityCard` for
`tool` events, `ArtifactBlock` and `InteractiveAnswerBlock` for rich output. The
previous per-message `toolStates` renderer was removed with the orchestrator.
