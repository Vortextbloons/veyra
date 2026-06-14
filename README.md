# Veyra

[![GitHub](https://img.shields.io/github/license/Vortextbloons/veyra)](https://github.com/Vortextbloons/veyra/blob/main/LICENSE)

Local-first AI desktop workspace built with **Tauri v2**, **React**, and **TypeScript**. Veyra targets [LM Studio](https://lmstudio.ai/) as the primary model provider and supports optional web search (SearXNG via Docker) and Agents mode (OpenCode CLI).

**Platform:** Windows is the supported development and build target for now.

## Prerequisites (Windows)

Install these before cloning:

| Tool | Notes |
|------|--------|
| [Node.js](https://nodejs.org/) LTS | **20+** required (`package.json` `engines`) |
| [Rust](https://www.rust-lang.org/tools/install) | **1.77.2+** (see `rust-toolchain.toml`) |
| [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) | Workload: **Desktop development with C++** |
| [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) | Usually preinstalled on Windows 11 |

Full Tauri checklist: [Tauri v2 — Prerequisites](https://v2.tauri.app/start/prerequisites/)

Verify tools (optional):

```powershell
.\scripts\setup-windows.ps1
```

## Quick start

```powershell
git clone https://github.com/Vortextbloons/veyra.git
cd veyra
npm install
npm run dev:full
```

Repository: [github.com/Vortextbloons/veyra](https://github.com/Vortextbloons/veyra)

### Faster development loop

For quicker Rust restarts, run Vite and Tauri in two terminals:

```powershell
# Terminal 1
npm run dev:ui

# Terminal 2
npm run dev:app
```

| Script | Description |
|--------|-------------|
| `npm run dev:ui` | Vite only (http://localhost:1420) |
| `npm run dev:app` | Tauri dev using `tauri.dev.conf.json` |
| `npm run dev:full` | `tauri dev` (starts Vite via `beforeDevCommand`) |
| `npm run build:app` | Production installer/binary |
| `npm run lint` | ESLint |

## Production build

```powershell
npm run sync-version
npm run build:app
```

Artifacts appear under `src-tauri/target/release/bundle/`.

## Optional features

These are **not** required for basic chat:

| Feature | Requirement |
|---------|-------------|
| Local models | [LM Studio](https://lmstudio.ai/) and `lms` on PATH |
| Web search (SearXNG) | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Agents mode | [OpenCode](https://opencode.ai/) CLI on PATH |

See [Opencode/agentsmode.md](Opencode/agentsmode.md) for Agents mode design notes.

## Versioning

The canonical version lives in [version.json](version.json).

```powershell
# After editing version.json
npm run sync-version
npm run version:check
npm install
```

Release tags example: `git tag v0.1.0`

## Environment variables

Copy [.env.example](.env.example) to `.env.local` for optional `VITE_*` / `TAURI_*` build-time values. **Never commit real API keys.**

## Privacy and local data

Veyra stores runtime data on your machine only:

- `%APPDATA%\com.veyra.app\` — conversations, SQLite memory DB, keys
- Browser `localStorage` — settings and caches (`veyra.*` keys)

Do not commit these paths or files to git.

### Local-only constants (not remote secrets)

Some values in source are **intentional local-dev defaults**, not credentials for cloud services:

- SearXNG `secret_key` in `src-tauri/src/searxng_setup.rs` — local Docker instance only
- Conversation encryption fallback material in `src/lib/conversation-storage.ts` — legacy local storage

Do not put production passwords or API keys in the repository.

## Third-party assets

Logo files under `public/logos/` and root `*.jpg` brand images are for UI display. Ensure you have rights to redistribute them before publishing forks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
