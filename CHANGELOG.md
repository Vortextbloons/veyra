# Changelog

All notable changes to Veyra are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-11-04

Minor release since [2.0.0](https://github.com/Vortextbloons/veyra/releases/tag/v2.0.0). Chat now runs entirely on a bundled Pi runtime, projects move into the primary sidebar with browsable resources, and OpenCode Go joins the cloud provider presets. Pi and Node ship with the app, so no global runtime installation is required.

### Added

- **Bundled Pi runtime** — Pi and its Node runtime are packaged with Veyra. `scripts/prepare-pi.mjs` installs the pinned production dependencies into `src-tauri/resources/pi`, copies the build machine's Node executable, and runs automatically for the development and build commands. Installed apps no longer depend on a global Pi or Node installation. See `docs/bundled-pi.md`.
- **OpenCode Go** — New cloud provider preset served from `https://opencode.ai/inference/go/v1`, with catalog model normalization and display-name handling. Presets shipped after a configuration was saved are merged into it without touching existing providers.
- **Project sidebar** — Projects, their chats, and their resources are managed from the primary sidebar. Create a project, open a folder as a project, rename or delete it, attach files and folders, browse resource contents, and add a resource file to the composer as an attachment.
- **Project chats** — Assign a chat to a project from the composer, or start a project chat from the sidebar. Projects now store resources and a system-prompt version. Legacy project records migrate, and their previously project-scoped chats become unassigned.
- **Chat steering** — Send a text message while a response is running to steer the active Pi run. Successfully submitted steering messages are saved in conversation history; attachments can be sent after the response finishes.
- **Math rendering** — KaTeX rendering for math in chat messages.
- **Reasoning metadata** — NVIDIA reasoning corrections for Nemotron, MiniMax, and DeepSeek models, with explicit effort levels and token limits preserved in reasoning route configuration.

### Changed

- **Unified chat runtime** — Chat, research, and project work all run through Pi. The provider-driven chat orchestrator, duplicate tool loop, standalone agent composer, Plan/Build selector, and chat/plan mode switching are gone. Web search now runs through Veyra's `SearchOrchestrator` and a Pi host-tool bridge.
- **Conversation storage** — The encrypted snapshot envelope moved into shared helpers used by the encrypt/decrypt workers and the main-thread fallback, with revision-bound authenticated data and decryption fallback for legacy snapshots. Existing conversations and agent sessions migrate to the unified runtime.
- **Reasoning lookups** — A long-lived Node worker replaces per-request spawns for model capability lookups. Pi's model catalog refreshes once at launch, cached reasoning lookups are invalidated when it changes, and failed lookups are retried instead of cached as unavailable.
- **Web search** — The bundled engine gains the adaptive-recall patch and source bundling, with a build/benchmark pipeline under `scripts/search-engine`. Automatic query variants and official-source recalls can finish early when primary results are already strong, while thin results keep the original recovery path.
- **Model and provider selectors** — The shared selector component is removed and markup is inlined. Context breakdown is simplified, web search fetch types are consolidated into the web-search module, and the conversation storage legacy-key helper is cleaned up.

### Fixed

- **Pi discovery** — Fixed Pi SDK discovery around Cargo's bundled `pi` directory and stale `PATH` entries.
- **Pi configuration** — Pi configuration files prefixed with a UTF-8 BOM now parse correctly.
- **Reasoning levels** — Failed capability lookups no longer leave a model stuck at "unavailable", and explicit effort levels survive reasoning route configuration.

### Removed

- **Agents navigation** — The separate Agents nav entry and workspace mode switching. Agent sessions now appear in the chat sidebar and run on the same bundled runtime.
- **Chat controls** — The Plan/Build selector and the in-chat code execution UI.
- **Legacy chat pipeline** — `chat-actions`, `chat-context-builder`, `chat-orchestrator`, `chat-provider-options`, `chat-tool-loop`, `chat-tool-rounds`, `chat-tool-utils`, the standalone agent composer, and the built-in chat tools (`artifact`, `ask-question`, `code-execution`, `interactive-answer`, `scratchpad`, `web-search`) that Pi host tools now replace.

## [2.0.0] - 2026-10-30

Major release since [1.5.2](https://github.com/Vortextbloons/veyra/releases/tag/v1.5.2). Veyra refocuses on chat, research, agents, and projects: Studio and Characters are gone, Memory returns in a new form, and web search is fully bundled. Chat gains reasoning controls, deliverable artifacts, and interactive in-message experiences.

### Added

- **Memory** — Persistent, encrypted fact storage with a dedicated Settings tab. Facts are extracted from chat and agent turns in the background, ranked into prompts by relevance, scoped globally or per project, and editable or deletable manually. Deleting a chat, agent session, or project invalidates related memories. Memory is off by default until enabled in settings.
- **Chat artifacts** — The `create_artifact` tool attaches HTML, Markdown document, or downloadable code outputs to an assistant message (one per message). The viewer supports collapse, fullscreen, copy, download, print, and in-place document editing. HTML previews use a sandboxed iframe and a Rust in-memory preview server with strict CSP; prior artifacts stay visible until a regeneration succeeds.
- **Interactive answers** — The `interactive_answer` tool renders structured UI inside a message: charts, comparisons, calculators (including multi-output formulas), step lists, diagrams, text blocks, and multi-section boards. Summaries are injected into provider history so the model does not repeat the full payload.
- **Chat reasoning levels** — Composer control for thinking effort on capable models: discrete slider or on/off switch from LM Studio model metadata or the Pi registry, per model and endpoint, with refresh and clamping to advertised levels. Documented in `docs/chat/08-reasoning-levels.md`.
- **NVIDIA MiniMax M3.1 Flash** — Reasoning effort overrides for `minimaxai/minimax-m3.1-flash` on NVIDIA integrate endpoints, including `xhigh` / `max` levels where supported.
- **Bundled web search (DonSeTch)** — App-managed [DonSeTch](https://github.com/dondai44423/donsetch) metasearch engine: pinned binary fetched at build/dev time, ephemeral loopback MCP port with bearer auth, health polling, and clean shutdown with the app. No Docker, Python, or user-supplied search URL.
- **Search engine status** — Running state, version, restart, and log access under Settings → Tools → Web Search.

### Changed

- **Web Search** — Replaced the Docker-managed SearXNG container and frontend search planner, ranker, routing, evaluation, and SearXNG setup flows with DonSeTch-backed search and a slimmer orchestrator. Research and chat workflows use the new engine path.
- **Web Search settings** — Removed SearXNG URL, Docker container controls, time range, categories, safe search, language, pagination, multi-query, fusion, freshness, and quality-filter knobs. Intent-aware engine ranking replaces most manual tuning. Added engine bundle and supervisor sections where needed for developers.
- **Web Search fetching** — Rust fetch layer gains redirect handling, budgets, retry backoff, configurable Wayback fallback, soft timeouts for ArXiv and Wikipedia, and more reliable page retrieval for tool results. Keyless search disables ghost lanes by default.
- **Chat** — Artifact and interactive-answer metadata are kept out of provider history where appropriate; conversation snapshots persist message-owned outputs. MCP server disable lists for chat use stored IDs directly (removed `disabledMcpServersForChat` indirection).
- **Projects** — Search and filtering in the projects workspace refactored for clearer behavior and edge-case fixes.
- **Research** — Profile knob editor and related settings simplified alongside module cleanup.
- **Windows** — Child processes (`node`, Pi, LM Studio helpers, MCP stdio servers, search engine, etc.) spawn with `CREATE_NO_WINDOW` so release builds no longer flash console windows.

### Removed

- **Studio** — The Studio conversation experience, sandboxed HTML environments, `studio_render` / `studio_update` / `studio_theme` tools, themes, settings, stored response model, and documentation.
- **Characters** — Personas, lorebooks, group chat, character cards, AI-assist flows, SQLite/backend commands, stores, UI, and chat context bindings. README and architecture docs now describe eight feature areas without a Characters module.
- **SearXNG integration** — Container lifecycle, setup commands, provider adapter naming, and user-facing SearXNG server settings.
- **Agents** — Standalone `agent-selectors` module (logic inlined in the agent store).

## [1.5.2] - 2026-10-03

### Added

- **Studio** — Persistent HTML environments with sandboxed previews, version history, undo, and recovery when a revision fails to load.
- **Studio tools** — `studio_render`, `studio_update` (region patches), and `studio_theme` for iterative environment work.
- **Chat** — In-composer context meter and a consolidated chat options menu (replacing the old right-side panels).
- **Agents** — Reworked workspace with composer and inspector, workspace file context, and reasoning/thinking support for capable models.
- **Research** — Improvements to the extract phase and report viewer.

### Changed

- **Chat layout** — Context, tools, and Studio controls live in the main chat surface instead of a separate right panel.
- **LM Studio** — More reliable streaming/SSE handling for local models.
- **Agents** — Leaner Pi runner and expanded model capability detection.

### Removed

- **Documents** — The built-in documents module, editor, and document tools (focus shifted to chat, Studio, and projects).
- **Memory** — The project memory graph, extraction pipeline, and related settings (explicit chat context and other modules remain).

## [1.2.1] - 2026-07-26

Maintenance release. See [v1.2.1](https://github.com/Vortextbloons/veyra/releases/tag/v1.2.1) on GitHub.

## [1.2.0] - 2026-07-26

See [v1.2.0](https://github.com/Vortextbloons/veyra/releases/tag/v1.2.0) on GitHub.

## [1.0.0] - 2026-07-22

First stable-line release. See [v1.0.0](https://github.com/Vortextbloons/veyra/releases/tag/v1.0.0) on GitHub.
