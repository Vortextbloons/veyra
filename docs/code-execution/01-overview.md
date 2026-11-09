# Code execution

The `code_execution` host tool runs synchronous JavaScript in QuickJS compiled to WebAssembly, inside a dedicated worker. It works without a project, internet connection, or installed interpreter. Settings > Tools > Code execution controls availability and is enabled by default. The setting is persisted. Tool availability is checked again before each call, and the existing host permission gate applies when code execution is protected in permission settings.

## Workflow

The tool accepts a JavaScript function body in `code` and optional text in `input`. Code receives `input` and uses `return` for a JSON-serializable result. `console.log`, `info`, `warn`, `error`, and `debug` are captured. The response is JSON containing `logs` and `result`; a missing return becomes null. Errors return ordinary tool failure feedback so the AI can correct its code.

For example, use `return JSON.parse(input).reduce((sum, n) => sum + n, 0);` with input `[1,2,3]`.

For files, the AI first uses the existing permitted read tool and passes the contents as input. A project must be attached for project file tools. The sandbox cannot open a path. Output can be turned into a downloadable file using `create_artifact`, or saved using separately enabled and permitted write/edit tools. This tool does not execute arbitrary existing project files with their dependencies.

## Isolation and limits

Generated code is evaluated only in QuickJS, never host eval or Function. No host callbacks or module loader are installed. The guest has no filesystem, network, shell, Node, DOM, Tauri IPC, credentials, package installation, or async APIs. This is a WebAssembly runtime boundary, not an OS process sandbox. Native host interpreter execution remains unsupported.

Each call creates a fresh worker and runtime. Limits are 1,000,000 combined code/input characters, 64 MiB QuickJS guest allocation, a 512 KiB guest stack, five seconds of execution, 60,000 serialized output characters, and 1,000 log entries. The memory limit covers the guest allocator, not all worker/browser overhead. A parent watchdog terminates the worker after ten seconds including startup; cancellation also terminates it. Workers and VM handles are disposed after completion or failure. Keep the bundled QuickJS dependency updated as part of normal dependency maintenance.

The worker and Wasm are bundled locally by Vite. Production and development CSP permit WebAssembly compilation via `wasm-unsafe-eval`, without enabling host JavaScript unsafe-eval. Runtime code lives under `src/lib/code-execution`; routing uses the existing Pi host-tool bridge.
