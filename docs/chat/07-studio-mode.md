# Studio Mode

Studio Mode is a conversation-level presentation mode that lets the assistant return a complete visual artifact made from ordinary HTML and CSS. Veyra owns the shell, validation, isolation, persistence, and revisions. The model owns the content inside the canvas.

Eligible for Chat and Characters. Agents and Research are unchanged.

## User guidance

### Enable Studio

1. Open **Settings → Tools → Studio Mode** and leave **Enable Studio Mode** on (default for MVP).
2. In a chat or character conversation, set the composer presentation control to **Studio**.
3. Ask for a visual response such as a dashboard, timeline, comparison, scene, or planner.

Turning the global setting off hides the presentation control and stops advertising the Studio tool. Existing encrypted artifacts remain and reappear if the setting is turned back on.

### Revise an artifact

Ask for visual or content changes in the same conversation. Veyra includes the current validated artifact only when the turn is a revision request. Successful renders create a new immutable revision; the previous valid revision stays recoverable through undo and history.

### View source and copy

Use the Studio toolbar to open the source viewer (HTML and CSS tabs), copy HTML, or copy CSS. Source viewing is Veyra UI, not iframe content, and is read-only in MVP.

### Export limitations

Export writes the validated, self-contained Veyra-built HTML document through the native save dialog. Exports:

- Do not include JavaScript
- Do not load remote scripts, styles, fonts, images, or other network resources
- Are built from the selected validated revision, never from raw unvalidated tool arguments
- May differ slightly from future shell CSP policy because the outer document is regenerated at export time

### What Studio does not do in MVP

- No JavaScript execution inside artifacts
- No automatic Studio activation without the presentation control
- No network, filesystem, clipboard, Tauri, or host-store access from the iframe
- No Agents or Research Studio support
- Transient form control state inside an artifact is not persisted

## How it works

When Studio is enabled for a conversation:

1. The chat pipeline adds a short Studio instruction and exposes `studio_render`.
2. Text and reasoning continue streaming normally.
3. Completed tool arguments are validated (HTML and CSS structural policy).
4. A valid payload becomes a new revision and loads into a sandboxed iframe (`srcDoc`, empty sandbox tokens).
5. Invalid payloads keep the last valid revision and allow one repair attempt per assistant run.

## Key files

| File | Responsibility |
|------|----------------|
| `src/modules/chat/studio/` | Types, tool, validator, document builder, runtime, export, shell |
| `src/stores/chat-store.ts` | Presentation, revision commit/select/undo, fork/hydration |
| `src/lib/tool-registry.ts` | Conditionally registers `studio_render` |
| `src/modules/chat/chat-provider-options.ts` | Eligibility and tool availability |
| `src/components/settings/studio-settings-section.tsx` | Global availability and local diagnostics copy |

## Diagnostics and storage threshold

Local counters track render attempts, repairs, final failures, validation issue codes, and serialized artifact byte size. They never record generated source.

If a conversation’s Studio revision payload approaches **5 MB**, that is the migration trigger to reconsider separate encrypted artifact storage. Use **Copy for feedback** in Studio settings to share redacted counters when reporting issues.
