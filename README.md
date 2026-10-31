# Veyra

[![GitHub](https://img.shields.io/github/license/Vortextbloons/veyra)](https://github.com/Vortextbloons/veyra/blob/main/LICENSE)

An AI desktop workspace that runs on your machine. Have conversations with AI, research topics, create interactive artifacts, and run agents in a local-first workspace.

## Quick start

```powershell
git clone https://github.com/Vortextbloons/veyra.git
cd veyra
npm install
npm run dev:full
```

Requires [Node.js](https://nodejs.org/), [Rust](https://www.rust-lang.org/), [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), and [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/).

## Releases

Grab the latest installer on the [releases page](https://github.com/Vortextbloons/veyra/releases). What's new is summarized in [CHANGELOG.md](./CHANGELOG.md).

## Features

- **Chat** — talk to local models (LM Studio) or cloud providers with streaming and tool calls
- **Research** — deep research pipeline with citations and source auditing
- **Artifacts** - interactive HTML previews attached to chat messages
- **Memory** - persistent local memory integrated into chat context
- **Agents** — plan-building and code-writing agents
- **Web Search** — bundled local search engine (DonSeTch), ArXiv, Wikipedia — no Docker or extra install
- **Projects** — scope chats and settings per project
- **Code Execution** — run code inside your workspace with AI

Workspace data is stored locally. Cloud providers and online tools send the context needed for their requests to the services you configure.
