# Bundled search patch

`adaptive-recall.patch` modifies DonSeTch 4.10.1 at commit
`3169d2d3e8e426ec0c0eca5cac15c05d83dcdc6f` and is licensed under
AGPL-3.0-only, like the upstream engine.

The initial query still runs across every selected engine and vertical.
Automatic query variants and official-source recalls also start concurrently.
After all primary lanes finish, pending automatic recalls can be canceled if:

- at least two backends returned hits;
- lexical ranking retains the requested number of distinct results;
- the existing weak-result check passes;
- recognized official domains appear among those results, unless the caller
  supplied explicit search operators.

Completed recall results are retained. Thin, irrelevant, single-backend and
missing-official-source results keep the original concurrent recovery path.
Semantic ranking, result limits, pacing intervals, cache TTLs, page reading and
the Fast/Normal presets retain their existing settings. The engine's existing
`DONSETCH_NO_SEARCH_EARLY=1` override also disables the new early return.

`fetch-search-engine.mjs` downloads the verified upstream runtime libraries and
builds the patched executable. Windows native intermediates live in a workspace
specific directory under the system temporary directory to avoid spaces in
BoringSSL's NASM paths. Other platforms use `src-tauri/target/search-engine/`.
`VEYRA_SEARCH_BUILD_DIR` can override the cache location. A first build requires Git, Rust, CMake,
NASM, a C++ toolchain and libclang (set `LIBCLANG_PATH` if necessary). Windows
builds should use the Visual Studio developer environment and a compatible
CMake/NASM pair. `CMAKE` and `CMAKE_GENERATOR` can select another installation.
Subsequent launches verify the patch and binary hashes and reuse the binary.

The bundle includes the complete patched `SOURCE.tar.gz`, the patch, upstream
`LICENSE`, `SOURCE-OFFER.txt` and build identity/checksum in `VEYRA-BUILD.json`.
Keep these files with distributed binaries so their corresponding source is
available. No engine code is linked into Veyra.

The patch includes deterministic Rust tests using paused time. From its cached
source directory, run:

```powershell
cargo test --profile fast --locked --features ocr,rerank,http search::recall::tests --lib
```

Compare an unmodified upstream executable with the patched executable:

```powershell
node scripts/search-engine/benchmark.mjs <baseline-executable> <patched-executable> <results.json>
```

This runs four public queries twice with fresh caches and reverses A/B order in
the second round. It records latency, complete ranked results, weak-result flags
and backend diagnostics. It excludes LLM generation and Veyra's page downloads.
