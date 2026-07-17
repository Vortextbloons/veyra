# Code Execution

Native Python execution is disabled until Veyra has an OS-enforced sandbox.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/code-execution.ts` | Frontend types and Tauri invoke wrappers |
| `src-tauri/src/code_execution/` | Rust backend: disabled-state enforcement |

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

The availability command always reports the feature as unavailable with the
security-boundary explanation. Interpreter detection and selection were removed.

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

The backend rejects execution even if a stale frontend or persisted setting
attempts to invoke the command.

## Safety

- No host Python process is started
- Persisted enablement from older releases is migrated to `false`
- The chat tool is excluded from provider tool definitions
- Re-enabling requires an OS-enforced filesystem, process, credential, and network boundary
