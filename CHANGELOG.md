# Changelog

All notable changes to Veyra are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
