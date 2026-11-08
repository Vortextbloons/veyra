# Startup optimization verification

Measured with the opt-in synthetic benchmark in `src/__tests__/lib/startup-performance.test.ts`. No user history was read or modified.

## Before and after

Seven runs per revision; median wall time, same machine and fixture: 200 conversations with 40 messages and 40 Pi events each, plus encrypted primary and backup snapshots.

| Operation | Before | After |
| --- | ---: | ---: |
| Snapshot loading, decryption and recovery selection | 911.263 ms | 53.522 ms |
| Pi session restoration | 4.707 ms | 0.057 ms |
| Startup saves across seven restorations | 7 | 0 |

The snapshot benchmark intentionally uses the main-thread crypto fallback, with Tauri file reads mocked and real AES-GCM/base64/JSON processing. It excludes filesystem IO, OS credential access, WebView startup, and first React render. These are component improvements, not a measured reduction in total process launch time. Worker code uses the same optimized decode and lazy legacy-key path but worker transfer timings were not measured.

## Changes

- Modern snapshots no longer derive the legacy PBKDF2 key on successful vault-key decryption. Legacy recovery still derives that key when needed.
- Base64 decoding writes into a preallocated typed array instead of iterating a string through `Uint8Array.from`.
- Restored Pi sessions reuse their saved transcripts and do not schedule another encrypted save. New and changed sessions continue saving normally.
- Search starts on the first request; eager reasoning-worker prewarming was removed. First use may therefore take longer. Backend lookup/startup locks still handle concurrent requests.
- Startup performance marks are available in release builds. Dev measurements include navigation-to-ready to include time before the main module executes.

All snapshot candidates are still validated and the newest valid revision is selected. Full encrypted history still loads at startup: no storage migration, history indexing or transcript-on-demand implementation is included. The initial bundle is unchanged in scope.

## Reproduce

PowerShell:

```powershell
$env:VEYRA_STARTUP_BENCHMARK='1'
npm.cmd exec vitest run src/__tests__/lib/startup-performance.test.ts
Remove-Item Env:VEYRA_STARTUP_BENCHMARK
```

Validation: frontend lint/build, 296 passing tests (benchmark skipped in normal runs), cargo check, and three passing search-engine unit tests. The live network search test remains ignored. Crypto tests cover successful vault decryption without legacy derivation, legacy recovery, byte-for-byte base64 decoding, and rejecting tampered revision authentication. Pi storage tests cover avoiding startup saves, changed output, project moves and deletion.

A packaged Windows cold/warm launch comparison is still needed to establish end-to-end startup gains.
