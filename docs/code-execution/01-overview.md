# Code Execution

Python code execution sandbox via Tauri backend. Used by the `code_execution` chat tool.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/code-execution.ts` | Frontend types and Tauri invoke wrappers |
| `src-tauri/src/code_execution/` | Rust backend: Python sandbox |

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

Detects Python installation on the system. If Python is unavailable, the `code_execution` tool is disabled.

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

Code is executed in a temporary working directory with configurable timeout. The tool returns stdout, stderr, exit code, and duration.

## Safety

- Code execution requires Python to be installed
- The tool is disabled-safe if Python is unavailable
- Configurable timeout prevents runaway code
- Executes in a sandboxed temporary directory
