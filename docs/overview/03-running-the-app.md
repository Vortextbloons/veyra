# Running the App

All commands use PowerShell. If PowerShell blocks `npm.ps1`, use `npm.cmd run <script>` instead.

```powershell
# Frontend only (browser preview)
npm run dev

# Desktop app (Tauri + hot reload)
npm run dev:app

# Full stack (Tauri production build)
npm run dev:full

# Production build
npm run build

# Lint and typecheck
npm run lint

# Tests
npm run test

# Combine docs
npm run docs:combine

# Verify version.json sync
npm run version:check
```

## Dev workflow

1. Run `npm run dev:app` for Tauri development with hot reload
2. `npm run build` for frontend-only changes
3. `npm run test` for behavior changes
4. `npm run lint` for broader TS/React edits
5. `npm run build:app` for Rust/Tauri changes when practical
