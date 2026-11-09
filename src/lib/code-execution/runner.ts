import { MAX_INPUT_CHARS, EXECUTION_TIMEOUT_MS, type CodeExecutionResult } from "./sandbox";

export function runJavaScript(args: Record<string, unknown>, signal: AbortSignal): Promise<CodeExecutionResult> {
  if (signal.aborted) return Promise.reject(new Error("Code execution cancelled"));
  if (typeof args.code !== "string" || !args.code.trim()) return Promise.reject(new Error("JavaScript code is required"));
  if (args.input !== undefined && typeof args.input !== "string") return Promise.reject(new Error("Input must be text"));
  const inputJson = JSON.stringify(args.input ?? null);
  if (args.code.length + inputJson.length > MAX_INPUT_CHARS) return Promise.reject(new Error("Code and input exceed the 1 MB text limit"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./execution.worker.ts", import.meta.url), { type: "module" });
    let finished = false;
    const finish = (error?: string, result?: CodeExecutionResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(new Error(error));
      else if (result) resolve(result);
      else reject(new Error("Code execution returned no result"));
    };
    const abort = () => finish("Code execution cancelled");
    // Includes cold Wasm startup; the VM also has a shorter execution deadline.
    const timer = setTimeout(() => finish("Code execution timed out"), EXECUTION_TIMEOUT_MS + 5_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ error?: string; result?: CodeExecutionResult }>) => finish(event.data.error, event.data.result);
    worker.onerror = () => finish("Could not start the JavaScript sandbox");
    worker.onmessageerror = () => finish("Could not read the JavaScript result");
    try { worker.postMessage({ code: args.code, inputJson }); }
    catch { finish("Could not send input to the JavaScript sandbox"); }
  });
}
