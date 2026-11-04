# Agents Module

Chat uses Pi as its main runtime for questions, research, and project work in one conversation. The separate Agents navigation and Plan/Build selector have been removed; legacy mode values remain readable in saved sessions.

- A project is optional. Without a folder, Pi receives only enabled Veyra host tools; built-in file and command tools are excluded.
- Attach a folder from Chat to enable file reads, edits, and commands. Folders are remembered as projects, and an existing project without a folder can gain one.
- The familiar Chat composer supports attachments, model selection, reasoning, web search, Skills, and MCP settings. Pi host tools use the RPC extension UI channel, with live capability and permission checks in Veyra.
- New run history shares Chat's encrypted conversation snapshot. Interrupted output is restored as stopped work. Legacy chat history can continue through Pi, and existing agent history is migrated when encrypted history hydrates.
- Responses are concise by default. Planning-only instructions are honored within the conversation without a separate mode.
- Web search runs through Veyra's existing `SearchOrchestrator` and Pi host-tool bridge. No third-party web extension is required.
- The former provider-driven Chat orchestrator, duplicate tool loop, standalone agent composer, and mode selector have been removed. Shared providers, search, artifact rendering, encrypted history, and memory services remain available to their current callers.

The detailed pages below also document the earlier standalone agent interface; confirm current UI behavior against the code.

## Contents

- [01-overview.md](01-overview.md) — Modes, session lifecycle, requirements
- [02-session-management.md](02-session-management.md) — Persistence, concurrency, operations
- [03-events.md](03-events.md) — Event types, channels, output merging
- [04-ui.md](04-ui.md) — UI components and panels
- [05-tauri-commands.md](05-tauri-commands.md) — Tauri IPC commands
- [06-types.md](06-types.md) — Key type definitions
- [07-reasoning.md](07-reasoning.md) — Model-specific reasoning controls and Pi routing
