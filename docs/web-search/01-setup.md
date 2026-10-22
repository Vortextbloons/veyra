# Web Search Setup

Veyra ships its own local search engine. There is no Docker dependency, no Python install, and no user-configured search URL.

## Bundled engine

The engine is [DonSeTch](https://github.com/dondai44423/donsetch), a Rust single-binary metasearch server. Veyra pins one release and runs it as a separate process over loopback MCP.

| Piece | Location |
|-------|----------|
| Engine binary and DLLs | `src-tauri/resources/search-engine/` (not committed) |
| Rerank model | `src-tauri/resources/search-engine/rerank/` |
| Runtime cache | `<app-data>/search-engine/` |
| Log | `<app-data>/logs/search-engine.log` |
| Fetch script | `scripts/fetch-search-engine.mjs` |

`npm run dev:app` and `npm run build:app` call `fetch-search-engine.mjs` automatically. It downloads the pinned `donsetch-win32-x64.tar.gz` (or the asset for the current platform), verifies the published SHA256, and fetches the 23 MB rerank model from Hugging Face.

The artifact is intentionally ignored by git. Run `npm run search-engine:fetch` after cloning if you are not using the npm scripts.

## Lifecycle

1. `SearchEngineState` is created during Tauri setup.
2. It reserves an ephemeral loopback port and generates a per-session bearer token.
3. It starts `donsetch mcp --http --host 127.0.0.1 --port <port>` with `CREATE_NO_WINDOW`.
4. The bundled rerank model is copied into the app cache on first launch.
5. The engine is polled at `/health` until ready (25 s budget).
6. On window close and `ExitRequested`, the process tree is killed with `taskkill /T /F` and `Child::kill`.
7. `Drop` for the engine state is a final safety net if the app exits unexpectedly.

`web_search` waits for engine readiness, calls the MCP `web_search` tool, and maps `_meta["com.donsetch/search-debug"].results` into Veyra's search response.

## Security

- The engine binds `127.0.0.1` only.
- The MCP endpoint requires `Authorization: Bearer <random token>` per session.
- The token is never persisted or exposed to the frontend.
- Search requests are made by the Rust supervisor, not the webview.
- The engine runs as a separate process; Veyra does not link it as a crate.

## Licensing

DonSeTch is AGPL-3.0. The fetch script copies its `LICENSE` and a `SOURCE-OFFER.txt` into the resource directory. Keep both in the installer. If Veyra ever patches the engine, publish the patch under the AGPL.
