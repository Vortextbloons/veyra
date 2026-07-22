# Veyra Documentation

Master index for all project documentation. Document order here determines the order in the combined output (`ALL.md`).

**How it works:** Each section lists a folder. The combine script auto-discovers **all** `.md` files in each folder (not just README), reads them in parallel, and appends them in alphabetical order. Add new `.md` files to any listed folder and they appear in `ALL.md` automatically — no INDEX.md edit needed.

## Overview

Project overview, tech stack, storage, and privacy notes.

| File | Description |
|------|-------------|
| [overview/README.md](overview/README.md) | Tech stack, storage paths, privacy model |

## Core

Central chat pipeline, memory system, and hooks.

| File | Description |
|------|-------------|
| [chat/README.md](chat/README.md) | Chat pipeline, streaming, tools, provider flow |
| [memory/README.md](memory/README.md) | Memory system, modes, extraction, retrieval |
| [hooks/README.md](hooks/README.md) | React hooks for chat, scheduling, and UI |

## Features

Feature modules built around the chat core.

| File | Description |
|------|-------------|
| [extensions/README.md](extensions/README.md) | MCP servers, Skills, capability grants |
| [documents/README.md](documents/README.md) | Document editor, versioning, export |
| [characters/README.md](characters/README.md) | Personas, lorebook, group chat |
| [research/README.md](research/README.md) | 9-phase deep research pipeline |
| [web-search/README.md](web-search/README.md) | SearXNG, ArXiv, Wikipedia search |
| [projects/README.md](projects/README.md) | Project containers and scoping |
| [agents/README.md](agents/README.md) | Pi CLI integration, plan/build modes |
| [connectivity/README.md](connectivity/README.md) | Online/offline mode, network detection |
| [code-execution/README.md](code-execution/README.md) | Disabled native execution and future sandbox boundary |

## Architecture

Cross-cutting patterns, state management, and system design.

| File | Description |
|------|-------------|
| [architecture/README.md](architecture/README.md) | State, scheduling, providers, backend |

## Meta

Agent update instructions and generated output (excluded from combined docs).

| File | Description |
|------|-------------|
| [AI_DOCS_UPDATE_PROMPT.md](AI_DOCS_UPDATE_PROMPT.md) | AI agent update instructions |
| [VEYRA_FULL_DOCS.md](VEYRA_FULL_DOCS.md) | Legacy combined output (deprecated) |

## Adding new docs

1. Create a `.md` file in the appropriate `docs/<folder>/` directory.
2. It will be picked up automatically by `npm run docs:combine` — no INDEX.md edit needed.
3. To **reorder sections**, edit the folder links above.
4. To **add a new section/folder**, add a new entry pointing to the folder's README (e.g. `folder/README.md`).

## File Count

**14 documentation folders** with multiple files each (auto-discovered by combine script).
