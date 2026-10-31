# Changelog

All notable changes to Veyra are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
