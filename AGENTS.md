# Veyra Agent Guide

This file orients AI coding agents working in this repository. It is guidance, not a rigid checklist. Prefer practical, focused changes over broad rewrites.

## Project overview

Veyra is a local-first AI desktop workspace built with:

- Tauri v2 for the desktop shell and Rust backend commands.
- React + TypeScript + Vite for the frontend.
- Zustand for client-side state.
- LM Studio as the primary local model provider.
- Optional SearXNG/Docker web search.
- Optional OpenCode-powered Agents mode.

The supported development/build platform is Windows.

## High-level architecture

- `src/` — React app, stores, provider adapters, orchestration logic, feature modules.
- `src/modules/` — larger feature areas such as documents, web search, memory, and agents.
- `src/stores/` — shared Zustand stores.
- `src/lib/` — cross-cutting app logic, chat pipeline, provider integrations, storage helpers, prompts, schedulers.
- `src-tauri/` — Tauri/Rust backend, command handlers, platform integration, bundled app config.
- `public/` — static assets.
- `scripts/` — setup/build helper scripts.

Important runtime data is local-only and should not be committed. See `README.md` for storage paths and privacy notes.

## Working style

- Preserve existing behavior unless the user clearly asks to change it.
- Read the relevant files before editing; avoid guessing architecture from filenames alone.
- Favor clear, maintainable code over clever abstractions.
- Keep UI changes visually consistent with Veyra's dark, polished desktop aesthetic.
- Do not introduce new dependencies unless there is a strong reason.
- Avoid touching generated build output in `dist/` unless explicitly requested.
- Do not commit secrets, API keys, user data, local databases, or machine-specific paths.

## Performance priorities

Performance matters in this app because it runs local AI workflows and desktop UI together.

When changing frontend code:

- Avoid unnecessary global state updates and broad re-renders.
- Keep hot paths in chat streaming, document editing, and scheduler updates lightweight.
- Use memoization only where it meaningfully reduces repeated work; do not over-memoize simple code.
- Be careful with `useEffect` loops, timers, event listeners, and subscriptions. Always clean them up.
- Avoid expensive work during render. Move parsing, searching, or aggregation out of render paths when needed.
- Prefer lazy loading for heavy optional areas, matching existing patterns.

When changing backend/Tauri code:

- Keep commands responsive and avoid blocking the UI thread.
- Treat file and database operations carefully; prefer focused reads/writes and clear error handling.
- Preserve local-first behavior and avoid unexpected network calls.

When changing AI/provider orchestration:

- Streaming responsiveness is important. Do not block chunk delivery with unrelated post-processing.
- Tool calls, web search, document operations, memory extraction, and agent jobs may interact; trace the flow before editing.
- Avoid adding extra model calls unless the behavior needs them.

## Common commands

Use PowerShell on Windows.

```powershell
npm run dev:ui       # Vite only
npm run dev:app      # Tauri dev shell using dev config
npm run dev:full     # Full Tauri dev flow
npm run build        # TypeScript + Vite build
npm run build:app    # Production Tauri build
npm run lint         # ESLint
npm run version:check
```

For most frontend changes, `npm run build` is the best quick verification. Run `npm run lint` when touching broader TypeScript/React code or when style issues are likely.

## Feature notes

### Chat and AI pipeline

The chat pipeline lives mainly in `src/lib/chat-actions.ts`, `src/lib/chat-orchestrator.ts`, provider adapters under `src/lib/providers*`, and app-level streaming handling in `src/App.tsx`.

Be careful when changing:

- streaming callbacks,
- tool call handling,
- re-prompt flows,
- memory extraction handoff,
- scheduler job state.

### Documents

Documents are handled under `src/modules/documents/` with supporting storage/tool logic in `src/lib/`.

Document AI tools currently create, read, and update markdown documents. Inline or targeted edits should preserve surrounding content and use the narrowest update mode possible.

### Memory

Memory is local-first. Do not send memory data elsewhere unless the existing provider flow explicitly does so for the user's active request.

### Web search

Web search is optional and uses SearXNG/Docker. Keep it disabled-safe: basic chat should work without Docker or network access.

### Agents mode

Agents mode depends on OpenCode being available on PATH. Keep agent features optional and fail gracefully when unavailable.

## UI guidance

- Veyra uses a refined dark desktop interface with subtle borders, dim text, glassy surfaces, and restrained accent colors.
- Prefer accessible contrast and clear hit targets.
- Keep animations subtle and purposeful, especially in streaming or editor contexts.
- Avoid generic, oversized gradients or visual clutter unless the surrounding design supports it.

## Safety and data handling

- Never commit real secrets or local runtime data.
- Do not modify user documents, conversations, or memory behavior in surprising ways.
- For destructive actions, require explicit user intent or preserve the existing confirmation pattern.
- Respect Windows path handling and quote paths with spaces in shell commands.

## Verification expectations

Choose verification based on the change:

- TypeScript/frontend change: `npm run build`.
- Broad React/style change: `npm run lint` plus build when practical.
- Tauri/Rust change: use the relevant Tauri/Rust build/check command if available, or `npm run build:app` for full verification when practical.
- Documentation-only change: no build required unless docs reference generated artifacts or commands.

If verification is skipped, explain why.

## Git hygiene

- Check the working tree before summarizing changes; this repo may already contain user edits.
- Do not overwrite unrelated user changes.
- Do not commit, amend, push, or open PRs unless the user explicitly asks.
- Mention unrelated modified files when relevant so the user knows what was not touched.

## Good default behavior for agents

1. Understand the request and inspect nearby code.
2. Identify the smallest safe implementation path.
3. Make focused edits.
4. Verify with the lightest meaningful command.
5. Summarize what changed, where, and any warnings or follow-ups.
