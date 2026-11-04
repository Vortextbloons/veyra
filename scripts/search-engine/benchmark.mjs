// Live retrieval benchmark. Uses only public fixture queries and fresh caches;
// no LLM, page reads, user configuration, or saved conversations participate.
import { spawn } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const runtime = path.join(ROOT, "src-tauri", "resources", "search-engine");
const [baseline, candidate, output] = process.argv.slice(2);
if (!baseline || !candidate || !output) {
  throw new Error("Usage: node scripts/search-engine/benchmark.mjs <baseline-exe> <candidate-exe> <output.json>");
}
const queries = [
  ["general", "what is the James Webb Space Telescope", "web"],
  ["docs", "TypeScript discriminated union documentation", "code"],
  ["official", "how to use Rust ownership and borrowing", "code"],
  ["news", "latest NASA Artemis mission news", "news"],
];

async function measure(binary, query, intent) {
  const cache = await mkdtemp(path.join(tmpdir(), "veyra-retrieval-bench-"));
  let child;
  const pending = new Map();
  try {
    await cp(path.join(runtime, "rerank"), path.join(cache, "rerank"), { recursive: true });
    child = spawn(path.resolve(binary), ["mcp"], {
      cwd: runtime,
      windowsHide: true,
      env: { ...process.env, DONSETCH_CACHE_DIR: cache, DONSETCH_NO_CONFIG_FILE: "1", DONSETCH_NO_PREWARM: "1", DONSEEK_NO_GHOST_LANES: "1" },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let id = 0;
    createInterface({ input: child.stdout }).on("line", line => {
      try {
        const response = JSON.parse(line);
        pending.get(response.id)?.resolve(response);
      } catch { /* Non-protocol output cannot fulfill a request. */ }
    });
    const fail = error => { for (const request of pending.values()) request.reject(error); };
    child.on("error", fail);
    child.on("exit", code => fail(new Error(`Engine exited (${code}).`)));
    const rpc = (method, params) => new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => { pending.delete(key); reject(new Error("Search benchmark timed out.")); }, 48_000);
      const finish = callback => value => { clearTimeout(timer); pending.delete(key); callback(value); };
      pending.set(key, { resolve: finish(resolve), reject: finish(reject) });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: key, method, params }) + "\n");
    });
    await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "veyra-benchmark", version: "1" } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const started = performance.now();
    const response = await rpc("tools/call", { name: "web_search", arguments: { query, intent, max_results: 8, deadline_ms: 40000 } });
    const wallMs = Math.round(performance.now() - started);
    const result = response.result;
    const meta = result?._meta?.["com.donsetch/search-debug"] ?? result?.structuredContent;
    if (response.error || result?.isError || !meta?.results?.length || meta.cached) {
      throw new Error(`Expected uncached results: ${JSON.stringify(response)}`);
    }
    return { wallMs, engineMs: meta.elapsed_ms, weak: meta.weak, results: meta.results, engines: meta.engines };
  } finally {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    await rm(cache, { recursive: true, force: true });
  }
}

const rows = [];
for (let round = 0; round < 2; round++) {
  for (const [name, query, intent] of queries) {
    // Reverse A/B order in the second round to reduce ordering bias.
    for (const label of round ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
      const result = await measure(label === "baseline" ? baseline : candidate, query, intent);
      rows.push({ round, name, label, query, ...result });
      console.log(`${round + 1} ${name} ${label}: ${result.wallMs} ms, ${result.results.length} results, weak=${result.weak}`);
      await writeFile(path.resolve(output), JSON.stringify(rows, null, 2) + "\n");
    }
  }
}
