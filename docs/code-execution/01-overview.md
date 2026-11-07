# Code Execution

Native host code execution is disabled until Veyra has a real OS-enforced
sandbox. Timeouts, process termination, working-directory selection, and source
filtering are not security boundaries.

Veyra therefore does not register a Tauri command that spawns Python or expose
`code_execution` in provider tool definitions. The legacy tool name remains
recognized so stored or model-emitted calls fail closed with a clear disabled
error.

Settings expose an `Enable Python execution` toggle. Until the Pi path actually
registers an executor and a sandbox exists, that toggle does not change model
capabilities: `pi-chat-tools.ts` passes `codeExecutionEnabled: false` when it
builds the tool list, because there is no handler that can run `run-python`
safely. Treat the control as a preference that takes effect only when execution
is re-enabled end to end.
