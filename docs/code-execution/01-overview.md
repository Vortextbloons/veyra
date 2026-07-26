# Code Execution

Native host code execution is disabled until Veyra has a real OS-enforced
sandbox. Timeouts, process termination, working-directory selection, and source
filtering are not security boundaries.

Veyra therefore does not register a Tauri command that spawns Python or expose
`code_execution` in provider tool definitions. The legacy tool name remains
recognized so stored or model-emitted calls fail closed with a clear disabled
error.

Persisted code-execution settings are retained for state compatibility, but
they do not enable native execution.
