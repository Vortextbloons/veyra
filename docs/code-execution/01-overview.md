# Code Execution

Executes Python code locally by spawning the host interpreter as a subprocess.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/code-execution.ts` | Frontend types and Tauri invoke wrappers |
| `src-tauri/src/code_execution/commands.rs` | Rust backend: interpreter discovery and subprocess management |

## Python Availability Check

```typescript
type PythonAvailabilityResult = {
  available: boolean;
  resolvedPath: string | null;
  source: string | null;
  version: string | null;
  message: string | null;
};
```

On start (or when the user provides a custom path), `check_python_available`
probes the system:
- If a custom Python path is configured, it checks that path directly
- Otherwise it tries `python`, `python3`, and `py` in order
- Runs `python --version` to confirm the interpreter works and capture the
  version string

Returns `available: true` with the resolved path, source (`"custom"` or
`"probe"`), and version. Returns `available: false` with a help message if no
Python interpreter is found.

## Execution

```typescript
type PythonExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  pythonPath: string;
  durationMs: number;
  workingDirectory: string;
};
```

`execute_python_code` spawns the Python interpreter as a `tokio::process`:

- Code is passed via `-c` to avoid writing temporary files
- stdout and stderr are captured as strings
- A configurable timeout (1–300s, default 30) kills the process if exceeded
- If the process times out, `timedOut` is `true` and the process is killed
- The exit code, wall-clock duration, working directory, and Python path are
  returned alongside the output

## Safety

- Code runs as a child process with the same user privileges as Veyra
- No filesystem, network, or credential isolation is enforced at the OS level
- The timeout kill prevents runaway processes
- The chat tool exposes `code_execution` to the AI model only when the feature
  is enabled
