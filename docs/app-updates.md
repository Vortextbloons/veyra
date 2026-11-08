# Desktop updates

Veyra checks GitHub Releases after startup and stages the Windows installer while the app remains usable. Automatic checking also enables automatic downloading; disabling it leaves manual checks and downloads available. Downloading never closes the app. A second action, **Restart to update**, saves conversations and launches the staged installer with Tauri NSIS `/S /UPDATE /R` flags (quiet update and reopen). Windows permissions can still affect installation.

## Where to change behavior

- `src/lib/update-config.ts`: repository, startup delay, automatic download policy.
- `src/lib/app-update.ts`: release metadata mapping and IPC transport. GitHub asset `digest` supplies SHA-256; releases without it require manual installation.
- `src/stores/update-store.ts`: download, ready, restart and error states. Failed installation keeps the prepared release for retry.
- `src-tauri/src/app_update.rs`: official repository allowlist, download size/time limits, backend-owned staging, SHA-256 verification before preparation and again before execution, installer arguments. Repository changes must also update this backend allowlist.
- `.github/workflows/release-windows.yml`: publishes NSIS installers. No signing secret or new release service is required for the current GitHub digest integrity check. This is not a substitute for independently signed update artifacts.

Staging currently lasts for the running session; installers use the existing temporary update directory. Repeated preparation within a session reuses the verified file. A later app session downloads again. Full installers still include Pi and the search engine. No delta patching or separately downloaded runtimes are implemented.

## Future smaller downloads

Keep release lookup separate from preparation and installation. A future versioned resource manifest can stage Pi/search independently, verify each artifact, and reuse unchanged versions. That also requires changing runtime path resolution, first-launch/offline behavior and release packaging together. Do not remove bundled resources until that migration exists. True binary deltas additionally need base-version matching, atomic application/recovery and a full-installer fallback.

## Release verification

Run frontend tests/build/lint and Rust checks. On an installed per-user Windows build, publish a newer test release and verify: background download leaves the app usable; download errors allow retry; restart saves current conversations; NSIS installs quietly and reopens at the new version; custom install locations persist; missing or altered installer bytes cannot execute. Also test close during download and any supported machine-wide installation. Unit/build checks do not replace this installed-build smoke test.
