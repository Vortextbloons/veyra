# Studio

Studio is a persistent environment that the assistant shapes around a task. The main surface can become a visual explanation, chart, comparison, simulation, creative scene, or readable HTML. The conversation remains available in a drawer, and the normal composer, model selection, Stop, and host permissions remain under Veyra's control.

Studio is available for plain chat and project conversations. Character and group chats remain Standard. Enable it in **Settings → Chat → Studio Mode**, then choose **Studio** when starting an empty conversation. Disabling the global setting restores the transcript view without deleting existing responses or interaction state.

## Core experience

- The current view stays usable while a replacement loads in a separate sandboxed frame.
- A replacement becomes visible after its script initializes and reports ready. This verifies initialization, not visual quality or factual accuracy.
- If initialization fails, Veyra retains the previous usable view. Reopening a failed latest version tries earlier versions until a usable view is found.
- The footer reports gathering sources, shaping the environment, updating a view, or opening it. Stop remains accessible.
- **Conversation** opens the transcript without running duplicate copies of generated frames. Tool questions, pending MCP approvals, and message editing expose the drawer when attention is needed.
- **Undo** selects the previous version, skipping versions known to have failed in the current session. History retains failed versions for inspection or retry. **View latest** returns to the latest version.
- Source, copy, and export live in the environment options menu. Exports include selected facts and interaction state, and work without a Veyra connection.
- Text-only replies remain readable before the first environment exists; **Read response** exposes accompanying prose once a view exists.

## Model behavior and tools

The system instruction treats the environment as the primary answer. It does not require a prose preamble. Substantial text can itself be presented as readable HTML; acknowledgements and clarifying questions can remain conversational.

Three Studio tools are advertised only when Studio is enabled:

| Tool | Purpose |
|------|---------|
| `studio_render` | Create or transform a view with complete HTML, CSS, optional JavaScript, a concise summary, and optional JSON facts |
| `studio_update` | Replace the inner HTML of one unique `data-studio-region`, preserving surrounding content and omitted stylesheet, script, and facts |
| `studio_theme` | Adjust the surrounding atmosphere using a short vibe, or optional palette, font, and scoped declarations |

Region updates require the exact current environment base key. Veyra rejects stale keys, missing or ambiguous regions, invalid arguments, and unsafe merged source. Each update becomes a complete immutable revision; partial source is never executed.

Every follow-up includes the active version's summary, region names, bounded source, facts, interaction state, latest interaction, and runtime feedback. Tool rounds refresh that context. This applies to ordinary prompts such as “remove that” and “what if we double it,” rather than relying on revision keywords. Large context sections are explicitly truncated; the full validated source remains local.

## Local interaction API

Generated JavaScript runs after state initialization. The frame provides:

| API | Behavior |
|-----|----------|
| `studio.data` | JSON facts supplied with the revision, separate from appearance |
| `studio.getState()` | A copy of persistent interaction state |
| `studio.setState(object)` | Merge a small JSON state patch |
| `studio.emit(name, payload)` | Record a selection or other interaction for the next prompt |
| `studio.chart(element, options)` | Local SVG bar or line chart with labels, numeric values, optional color/title, and optional `onSelect` callback |

Charts support pointer and keyboard selection, expose accessible values, and restore their saved selection. Chart options use `type: "bar" | "line"`, `labels`, and `values` (1–200 finite numbers). No external chart dependency is loaded.

Inputs, selects, and textareas with stable `name` or `data-studio-key` attributes automatically preserve values. Password, file, and hidden inputs are excluded. Scroll position is retained. Custom controls use `studio.setState`. Form-control values and scroll position use reserved `$controls` and `$scroll` state keys.

Events do not automatically start a model request or execute a host action. Local controls respond immediately; the user sends a prompt when interpretation or new information is needed. The last selected chart category is surfaced in the footer and included in follow-up context.

## Runtime feedback and repair

The bridge supports initialization, readiness, state, interaction, and error messages. Veyra verifies the originating frame window and a per-frame channel, then validates JSON shape, nesting, size, event names, and version ownership. It exposes no generic host command.

Script errors and unhandled promise rejections are reported to Veyra. During a foreground tool round, Veyra waits briefly for the exact originating version's feedback, releasing immediately on cancellation. One runtime repair is allowed per assistant job; another failure stops automatic view generation for that job. Invalid source also has one bounded repair opportunity.

Background or unmounted conversations save source without claiming successful display. Late errors remain available to the next prompt and the **Repair** action. A view that does not initialize within six seconds offers retry or repair. The previous usable view remains available throughout recovery.

## Storage and compatibility

Generated source remains on `assistantMessage.studioResponse`, with at most eight revisions per message. Environment history is derived from those revisions in creation order, including regenerated older messages. It does not duplicate their source in a separate workspace snapshot.

`conversation.studioEnvironment` stores only selection, interaction state, latest event, and runtime feedback in the existing encrypted conversation snapshot. State and event payloads are limited to 16 KB; revision facts are limited to 32 KB. Unsafe keys, non-JSON values, excessive depth, and oversized payloads are rejected. State changes are coalesced by the frame and use the existing debounced encrypted persistence.

Existing message-owned Studio responses remain usable, including previously selected revisions. Forks copy state and remap selected message identities. Stale selection/feedback references are discarded during normalization. The old `presentationMode` and `studioArtifact` fields remain unsupported. No development-data reset is required.

## Isolation and preferences

Frames have an opaque origin with `sandbox="allow-scripts"` and restrictive CSP. There are no network connections, remote libraries/fonts/images/media, child frames, workers, form submissions, or filesystem/Tauri/clipboard/device permissions. Inline SVG, CSS, DOM interaction, and the narrow local bridge are supported. External data still comes through Veyra's existing provider tools and their permission flows.

**Presentation** offers Automatic, Calm, and Expressive. Automatic follows the task; Calm asks for restrained styling and disables CSS motion; Expressive invites distinctive art direction. System reduced-motion preferences are observed. Generated JavaScript must also honor reduced motion; arbitrary script animation cannot be mechanically rewritten.

## Verification and key files

- `studio-environment.ts`: timeline, bounded JSON, bridge parsing, and state normalization
- `components/studio-environment-view.tsx`: primary surface, staged rendering, history, recovery, source, and export
- `studio-bridge.ts`: frame-local state, controls, charts, readiness, and runtime feedback
- `studio-runtime.ts`: validated commits and bounded feedback/repair handling
- `studio-update-tool.ts`: targeted updates with base-version checks
- `studio-context.ts`: environment-first instructions and continuity
- `chat-panel.tsx`: Studio surface, conversation drawer, attention handling, and existing composer
- `chat-store.ts`: message-owned source, encrypted environment state, selection, and forks

Focused unit tests cover continuity, normalization, limits, ownership, forks, and cancellation. Browser tests run the real ChatPanel in an isolated Vite/Playwright fixture with synthetic data and mocked Tauri storage. They cover frame transitions, controls, chart selections, recovery, questions, targeted validation, spoofed messages, responsive layout, portable export, and bounded repair. The browser test requires Playwright Chromium or installed Microsoft Edge.

Local diagnostics remain source-free. The existing 5 MB response snapshot threshold remains a signal to reconsider separate encrypted source storage.
