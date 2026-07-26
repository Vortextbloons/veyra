# Studio Mode

Studio Mode is a conversation experience that lets the assistant respond naturally while optionally giving an individual assistant message a custom visual or interactive body. A Studio turn can remain formatted text, or use self-contained HTML, CSS, inline SVG, and JavaScript when bespoke presentation makes the answer clearer. Independently, a turn may apply a validated chat-panel theme so the transcript, header, and composer share the response's atmosphere without requiring a custom message body.

Veyra owns validation, isolation, persistence, revisions, sizing, and host controls. The model owns the content and styling inside the custom message. Studio is currently available for plain chat conversations; character and group chats remain Standard.

## User guidance

### Enable Studio

1. Open **Settings → Chat → Studio Mode** and enable Studio Mode.
2. Choose **Studio Chat** when starting an empty plain chat.
3. Talk normally. You can explicitly request a diagram, comparison, visual explanation, or interactive control, but you do not have to choose a format for every turn.

Turning the global setting off hides the experience choice and stops advertising the Studio tool. Existing encrypted custom messages remain stored and reappear if Studio is enabled again.

### Conversational behavior

Studio keeps the normal transcript visible. Text begins streaming in the assistant message while the model decides whether a custom presentation adds value. Short answers and follow-ups can remain text-only. When a custom message is appropriate, it appears on the originating assistant turn rather than replacing the conversation with a workspace.

### Revise a custom message

Ask for visual, interaction, or content changes in the same conversation. Veyra includes the latest validated Studio response for likely revision requests. Successful regenerations create immutable message-owned revisions; the previous valid revision remains recoverable through undo and history.

### View source, copy, and export

The Studio message toolbar can show HTML, CSS, and JavaScript source, copy the complete self-contained document, export it, expand the message, or navigate its revision history. Source viewing is read-only Veyra UI rather than generated iframe content.

Exports are regenerated from the selected validated revision and include its self-contained JavaScript. They do not load remote scripts, styles, fonts, images, or other network resources.

## JavaScript capability and isolation

JavaScript is optional and runs only inside an iframe with `allow-scripts` and an opaque origin. The generated document uses a restrictive content security policy:

- No network connections, remote resources, child frames, workers, plugins, or form submissions
- No filesystem, Tauri, host-store, device, payment, or clipboard permissions
- No same-origin access to Veyra and no privileged host API bridge
- No `eval` or dynamically compiled code
- Self-contained DOM interaction, CSS animation, inline SVG, and native controls are supported

Transient interaction state is not persisted unless the assistant produces a new revision that encodes it.

## How it works

1. The chat pipeline adds Studio conversation guidance and exposes two focused tools: `studio_render` for an optional custom message body, and `studio_theme` for the surrounding chat atmosphere.
2. Text and reasoning stream through the normal assistant message immediately.
3. A tool call creates a message-local working state while its arguments are parsed and validated.
4. Valid source becomes a new message-owned revision and loads into a networkless sandboxed iframe.
5. A sizing bridge reports document height so compact messages fit their content; unusually large messages remain bounded and can be expanded.
6. Invalid custom source leaves the conversational answer usable, preserves the last valid revision, and allows one repair attempt per assistant run.

`studio_theme` requires only a short `vibe`, keeping the default call inexpensive for smaller models. It also supports progressive disclosure: the assistant may optionally author a partial or complete palette, typography, intensity, ambient effect, and scoped CSS declaration blocks for the window, header, transcript, assistant messages, user messages, and composer. Veyra derives only the values the assistant omits.

Custom declarations are attached to fixed chat regions, so the assistant can create its own borders, gradients, shadows, spacing, typography, and other treatments without writing selectors or escaping into navigation and other host UI. Network URLs, rule injection, hidden or disabled interaction surfaces, and viewport-positioned overlays are rejected. Unthemed turns preserve the latest theme, and the vibe `default` explicitly restores Veyra's standard appearance.

## Key files

| File | Responsibility |
|------|----------------|
| `src/modules/chat/studio/` | Types, prompt context, tool contract, validator, document builder, runtime, theme, export, workspace, and custom-message UI |
| `src/modules/chat/studio/studio-theme-tool.ts` | `studio_theme` tool definition, vibe parsing, palette and CSS style validation |
| `src/modules/chat/studio/studio-theme.ts` | Theme derivation from vibe, preset matching, CSS variable generation, scoped region styling |
| `src/modules/chat/studio/components/studio-workspace.tsx` | Full-workspace scene viewer with history, navigation, source view, and export |
| `src/modules/chat/components/message-bubble.tsx` | Studio-aware conversational and working states |
| `src/app/components/chat-panel.tsx` | Keeps Studio in the standard transcript flow |
| `src/stores/chat-store.ts` | Message-owned revision commit, selection, undo, fork, and hydration; workspace state |
| `src/lib/tool-registry.ts` | Conditionally registers `studio_render` and `studio_theme` |
| `src/modules/chat/chat-provider-options.ts` | Eligibility and tool availability |
| `src/components/settings/studio-settings-section.tsx` | Global availability and local diagnostics copy |

## Diagnostics and storage threshold

Local counters track render attempts, repairs, final failures, validation issue codes, validation time, HTML/CSS/JavaScript byte totals, and serialized response size. They never record generated source.

If a Studio response snapshot approaches **5 MB**, that is the migration trigger to reconsider separate encrypted response storage. Use **Copy for feedback** in Studio settings to share redacted counters when reporting issues.
