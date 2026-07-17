# Storage Paths

All runtime data is local-only and never leaves your machine. Timestamps are ISO 8601 strings in most structured records.

| Data | Location | Format |
|------|----------|--------|
| Conversations | `%APPDATA%/com.veyra.app/` | AES-GCM encrypted JSON |
| Memory DB | `%APPDATA%/com.veyra.app/` | SQLite |
| Settings | localStorage | `veyra.settings.v1` key |
| Provider config | localStorage | `veyra.provider.v1` key |
| Characters | SQLite via Tauri | Structured records |
| Documents | SQLite via Tauri | Structured records |
| Projects | SQLite via Tauri | Structured records |
| Research | SQLite via Tauri | Structured records |
| Email accounts | SQLite via Tauri | Structured records |
| Agent sessions | localStorage | Serialized sessions |
| Cloud credentials | OS credential vault | Tauri secure storage |

## Privacy

- No data leaves the machine unless the user explicitly enables web search, cloud providers, or email sync
- Cloud API keys are stored in the operating-system credential vault through Tauri and are excluded from Zustand persistence
- AES-GCM encryption for conversation files with keys managed by the Rust backend
- Web Workers handle encryption/decryption without blocking the UI
