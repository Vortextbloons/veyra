# Changelog

All notable changes to Veyra are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0] - 2026-11-08

Minor release since [2.3.0](https://github.com/Vortextbloons/veyra/releases/tag/v2.3.0). Skills become a standalone library you apply per message or pin to a chat, and the model can be allowed to choose them. Updates now download and verify in the background and install when you restart, and startup no longer repeats work it used to do on every launch.

### Added

- **Skill library** — Settings → Skills is now the whole management surface: create, edit, duplicate, delete, import a folder or ZIP, and export a Skill as a ZIP. Skills follow the [Agent Skills](https://agentskills.io/specification) shape — a `SKILL.md` with `name` and `description` frontmatter plus a Markdown body — so a Veyra manifest is no longer required. Imports accept a folder or ZIP containing `SKILL.md` at its root and unwrap an archive that wraps everything in one folder; exports write `<slug>/SKILL.md` with supporting files. Packages are still validated as inert content, with the same 60,000-character instruction cap, 5 MB and 200-file limits.
- **Per-message and per-chat Skills** — Type `/` in the composer to apply a Skill to the next message; the chip reads "This message", keeps any text you already typed, and clears once the request is sent. **Pin** on that chip, or the Chat options panel, promotes it to the whole chat, where it gets a distinct chip and stays until removed. Applied Skills are shown on the user message and in the composer above the draft.
- **Model-selected Skills** — A library-wide **Let the model choose Skills** default (off) advertises each allowed Skill by name and description in an `<available_skills>` catalogue and registers a `use_skill` tool. Each Skill can override the default with **Model may use** or **Manual only**, and manual use is never restricted. Access is re-checked on every call, so disabling a Skill or switching it to manual mid-request takes effect immediately. Bodies stay out of the prompt until the model asks for them, and a loaded Skill is appended to that request's record.
- **Repeat with the same Skill instructions** — Retry on a user turn replays the Skill invocations recorded on it, so an edited or deleted Skill cannot change what runs.
- **Background update downloads** — After the automatic startup check the Windows installer downloads and is verified while the app stays usable. The update banner and Settings → About read **Download update**, then **Restart to update**; restarting saves conversations, stops streaming and the bundled runtimes, and launches the staged installer.
- **Working indicator in recent chats** — A session that is still running shows a spinner in place of its chat icon.

### Changed

- **Installer verification** — `install_app_update` is split into `prepare_app_update` (download, SHA-256 check, backend-owned staging) and `install_app_update` (re-verify the staged bytes, then execute). The renderer never supplies an executable path, re-preparing the same release reuses the verified file, and a modified file is removed and rejected. Releases without a SHA-256 digest fall back to manual installation. NSIS installs with `/S /UPDATE /R` and MSI with `/passive /norestart AUTOLAUNCHAPP=True`; update policy is centralized in `src/lib/update-config.ts`. See `docs/app-updates.md`.
- **Skill migration** — `veyra.extensions.v1` is rewritten at version 2 and its retired payload is parked under `veyra.skills.legacy.v1`. `importLegacySkillsOnce()` merges it at startup before conversations restore: installed instructions and disabled state are kept, each old per-chat selection becomes an explicit chat-scoped Skill, and workflows and capability lists move to `legacyWorkflows` / `legacyCapabilities` for conversion. A selection made after upgrading is never overwritten.
- **Startup** — Modern snapshots no longer derive the legacy PBKDF2 key after a successful vault decryption, base64 decoding writes into a preallocated buffer, and restored Pi sessions reuse their saved transcripts without scheduling another encrypted save. The bundled search engine and reasoning worker now start on first use instead of at launch, and startup marks are recorded in release builds. On the opt-in benchmark, snapshot loading drops from 911 ms to 54 ms and seven restorations produce zero startup saves; see `docs/startup-performance.md`.
- **Startup screen** — The pre-React shell and the hydrated view share one branded screen (logo, tagline, sweep indicator) styled from `public/startup.css`, which also replaces the chat skeleton while conversations load.
- **Context meter** — Pi usage is split into input (including cached tokens) and output, drawn as a two-segment ring and bar with the reserved output shown separately. Counts are compact (`100K`, `1M`) through a shared `formatTokenCount` helper, the breakdown opens by default, the popover is wider, and it closes on blur.
- **Accent tokens** — Hardcoded indigo, violet and blue accents across the scheduler, model and reasoning selectors, toggles, sliders, chat options, and settings are replaced by `--color-accent` plus the new `--color-accent-line`, `--color-accent-tint` and `--color-accent-line-soft` tokens. Context block colors get a distinct palette.
- **Composer** — The web search toggle moved out of the composer toolbar into the chat options menu, and the project `<select>` became a searchable project picker. The submit button resolves through `resolveComposerAction`, so a running response with an empty draft shows **Stop** instead of a disabled dead end, while text keeps it a **Send** that steers.
- **Projects** — Creating a project is now a modal with a name, an optional folder and project instructions, shared by the sidebar and the composer picker. Deleting a project asks for confirmation and keeps its chats and original files.
- **Pi skill loading** — Skills for a request are written to `<app data>/extensions/pi-skills/<slug>/SKILL.md` with `disable-model-invocation: true` and passed as `--skill` paths after `--no-skills`, so Pi resolves supporting files itself without picking up unrelated user or project skills. Veyra sends the recorded instructions with the prompt rather than letting Pi re-read the file.

### Fixed

- **Context usage with caching** — Cached input tokens (`cacheRead`, `cacheWrite`) count toward the context meter, so a long conversation no longer appears to shrink once the provider starts reporting cached input.
- **Project deletion** — The confirmation replaces `window.confirm`, and a running session in the project now blocks the delete with an explanation instead of failing silently.
- **Interactive answers** — The OpenUI Lang prompt now treats component signatures as a strict contract and calls out the mistakes that produced invalid programs: children must be one array argument, `Col` takes at most three positional arguments, and the model is asked to check each call before submitting.

### Removed

- **`ChatMessage.skillSnapshot`** — The id/version-only record is replaced by `SkillInvocation[]`, which carries the content hash and the instruction snapshot actually used.
- **Skill state in the extensions store** — `skills`, `installSkill`, `removeSkill`, `setSkillEnabled`, `activeSkillIds`, `activeSkillWorkflowIds`, `resolveActiveSkill`, `resolveActiveSkillSelection` and the `skills` feature flag. Settings → Extensions now covers MCP servers and approvals only, and its Skills feature-flag row and library editor are gone.
- **Workflow selection** — Workflows are no longer part of a Skill; the composer picker and the Chat options radio list that selected them are gone, and imported packages keep them as `legacyWorkflows` so each can be converted or dropped.
- **Composer web search button** — The toolbar toggle, along with eager search-engine startup and reasoning-worker prewarming at launch.

## [2.3.0] - 2026-11-07

Minor release since [2.1.2](https://github.com/Vortextbloons/veyra/releases/tag/v2.1.2). You can now write the system prompt Veyra sends to the model, scale the entire interface, and get interactive answers written in OpenUI Lang. The research module is gone, chat no longer renders per-tool cards, and the settings surface is rebuilt around one shared layout.

### Added

- **Custom system prompts** — Settings → Chat holds your own instructions for every conversation, and each model in Settings → Models can carry its own override that replaces that text for that model only. A toggle sends the prompt as the *only* system prompt, passed to Pi as `--system-prompt`, which drops both Pi's built-in assistant prompt and Veyra's defaults; tool use can become less reliable in that mode. By default your instructions are appended after Veyra's own guidance via `--append-system-prompt`, so the runtime's tool and safety rules stay in place. An empty prompt leaves the defaults untouched.
- **Interface scale** — Settings → General scales the whole window from 70% to 160%. Scaling is applied by the desktop shell (`WebView2` zoom) instead of CSS `zoom`, so viewport units, sticky and fixed overlays, scroll containers and hit targets stay aligned at every level. The stored scale is applied before the window is revealed, so the UI no longer flashes at 100% and reflows. `Ctrl` + `+` / `-` / `0` and `Ctrl` + scroll work anywhere in the app, and the old `veyra.zoom` value migrates once.
- **Interactive answers in OpenUI Lang** — `generate_interactive_answer` now carries a model-written [OpenUI Lang](https://www.openui.com) program instead of a fixed chart/comparison/diagram payload. Veyra ships its own component library (`src/modules/chat/ui/`) styled for the dark desktop UI: layout, text, tables, charts, sliders, segmented controls, checklists, inputs, forms, icons, images and SVG drawing, plus about 50 `@` functions. Answers hold their own `$variables`, recompute with expressions, and react to clicks without another message; `@ToAssistant` sends a follow-up that carries the form values. Programs are parsed before they are stored, so unknown components, undefined references and truncated output come back to the model as a repairable tool error. The generated prompt is appended only while the feature is enabled.

### Changed

- **Interactive answers replace the template picker** — The `version: 1` kind-based payload (`chart`, `comparison`, `calculator`, `steps`, `diagram`, `text`, `board`) and its renderer are removed. Saved conversations that contain an old interactive answer still open; the block simply renders nothing for them.
- **Settings layout** — Settings now uses one shared set of layout primitives (`settings-ui.tsx`) instead of per-tab markup: content fills the window in bordered cards, each row keeps its explanation beside the control it changes, and destructive or risky choices are called out in place. General, Chat, Models, Cloud providers, Tools, Web search, Extensions, Privacy and Updates are all rebuilt on it. The tool section picker, collapsible settings sections, the model dropdown and the search-context/provider plumbing are removed.
- **Model defaults** — New installs start at 32,768 max output tokens and 8,192 reserved output tokens, and an unset context length now falls back to the context window the provider reports for the selected model. Existing installs still holding the old defaults (`0` max tokens, `1,024` reserved, `8,192` context) migrate once; custom values and per-model overrides are preserved.
- **Chat messages** — Assistant turns render markdown, artifacts and interactive answers only; the web search, question, scratchpad and code execution cards are gone from the message surface. The OpenUI renderer is lazy-loaded, and syntax highlighting is deferred while a message is still streaming so text keeps up with the model.
- **Agent rendering** — Stable agent turns are reused across renders and turn components are memoized, and Pi conversation snapshots are written on a throttle instead of on every token, removing the redundant rebuild on each save.
- **Provider startup** — Providers other than the selected one now connect in the background at launch, so switching providers no longer waits for a first connection.
- **Advanced source bundle** — DOCX, PPTX, XLSX and EPUB extraction is always on when the bundle is enabled; the per-format toggles, including their stored settings, are removed.
- **Artifacts and page reading** — The 5 MB artifact cap is gone in both the frontend normalizer and the Rust preview server, and fetched page bodies may now reach 25 MB.

### Fixed

- **Windows Node runtime paths** — Release builds hand Node a resource directory with the verbatim `\\?\` prefix Tauri canonicalizes to, which made Node's entrypoint resolver fail with `EISDIR` while resolving the drive root. The prefix is stripped for verbatim disk and UNC paths before the path reaches Node.

### Removed

- **Research** — The deep research pipeline, its Rust commands and SQLite tables, run history and reports, evidence and contradiction panels, depth presets, settings slice, tests, documentation and screenshot. Stored research runs are no longer read; saved navigation state pointing at research opens Chat instead.
- **Auto-naming and summaries** — Background chat auto-naming and auto-summarize, along with their model pickers, settings, `post-chat-jobs`, `auto-name`, `chat-summarize` and the summary prompt plumbing.
- **Code execution settings** — The `codeExecutionEnabled`, Python path and timeout settings, their slice and the code execution message card. The tool stays disabled for chat, as documented in `docs/code-execution/`.
- **Chat tool-call UI** — `tool-call-list`, `tool-call-shell`, `tool-call-indicator`, `tool-call-ui`, `web-search-block`, `web-search-state`, `ask-question-block`, `pending-question-registry`, `scratchpad-block`, `code-execution-block` and `source-extraction-ui`, plus the streaming tool and web-search state they read from. `chat-store` is reduced to conversation state; streaming now lives entirely in the Pi session.
- **Unused project pages** — The projects workspace page, project workspace, settings panel, export panel and create-project modal, which the sidebar flow replaced in 2.1.0, along with `empty-state`, `agent-status-dot`, `mcp-chat-toggle`, `skill-selector`, `project-skills-settings`, `segmented-control`, `async-pool` and `number`.

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
