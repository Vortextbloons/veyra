import type { QuickJSWASMModule } from "quickjs-emscripten-core";

export const MAX_INPUT_CHARS = 1_000_000;
export const MAX_OUTPUT_CHARS = 60_000;
export const EXECUTION_TIMEOUT_MS = 5_000;

export type CodeExecutionResult = {
  logs: string[];
  result: unknown;
};

/** Guest source is evaluated only by QuickJS inside WebAssembly, never host eval. */
export function executeSandbox(module: QuickJSWASMModule, code: string, inputJson: string): CodeExecutionResult {
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(64 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + EXECUTION_TIMEOUT_MS;
  runtime.setInterruptHandler(() => Date.now() >= deadline);
  const vm = runtime.newContext();
  try {
    // No module loader or host bindings: no filesystem, network, process, or IPC.
    const source = `(() => {
      const stringify = JSON.stringify.bind(JSON);
      const logs = [];
      let logSize = 0;
      const log = (...args) => {
        const text = args.map(value => typeof value === 'string' ? value : stringify(value)).join(' ');
        logSize += text.length;
        if (logSize > ${MAX_OUTPUT_CHARS} || logs.length >= 1000) throw new Error('Console output limit exceeded');
        logs.push(text);
      };
      globalThis.console = Object.freeze({ log, info: log, warn: log, error: log, debug: log });
      const input = JSON.parse(${JSON.stringify(inputJson)});
      const result = ((input) => { "use strict";\n${code}\n})(input);
      if (result && typeof result.then === 'function') throw new Error('Async code is not supported. Return a synchronous result.');
      const output = stringify({ logs, result: result === undefined ? null : result });
      if (output.length > ${MAX_OUTPUT_CHARS}) throw new Error('Output limit exceeded');
      return output;
    })()`;
    const evaluated = vm.evalCode(source, "execution.js");
    if (evaluated.error) {
      try {
        const error = vm.dump(evaluated.error) as { message?: unknown } | null;
        throw new Error(typeof error?.message === "string" ? error.message.slice(0, 2000) : "JavaScript execution failed");
      } finally { evaluated.error.dispose(); }
    }
    try {
      const output = vm.getString(evaluated.value);
      if (output.length > MAX_OUTPUT_CHARS) throw new Error("Output limit exceeded");
      const parsed = JSON.parse(output) as CodeExecutionResult | null;
      if (!parsed || !Array.isArray(parsed.logs) || !parsed.logs.every((line) => typeof line === "string") || !("result" in parsed)) {
        throw new Error("JavaScript returned an invalid result");
      }
      return parsed;
    } finally { evaluated.value.dispose(); }
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}
