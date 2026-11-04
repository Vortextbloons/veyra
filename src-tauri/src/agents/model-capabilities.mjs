// Bridge to the same installed Pi registry and reasoning helpers used by its CLI.
import { existsSync, statSync, readFileSync, realpathSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export function locatePi(searchPath = process.env.PATH ?? "", platform = process.platform) {
  for (const directory of searchPath.split(delimiter)) {
    if (!directory.trim()) continue;
    for (const executable of platform === "win32" ? ["pi.cmd", "pi"] : ["pi"]) {
      const bin = join(directory, executable);
      if (!existsSync(bin)) continue;
      // Cargo adds target/debug to PATH, where Tauri bundles a directory named
      // "pi". A directory (or broken shim) must not hide a later installation.
      try {
        if (!statSync(bin).isFile()) continue;
        const real = realpathSync(bin);
        const direct = join(dirname(dirname(real)), "package.json");
        if (existsSync(direct)) {
          const name = parsePiJson(readFileSync(direct, "utf8")).name;
          if (name?.endsWith("/pi-coding-agent")) return dirname(direct);
        }
        const wrapper = readFileSync(bin, "utf8");
        const match = wrapper.match(/node_modules[\\/](@[^\\/]+[\\/]pi-coding-agent)[\\/]/);
        if (match) {
          const root = join(directory, "node_modules", ...match[1].split(/[\\/]/));
          if (existsSync(join(root, "package.json"))) return root;
        }
      } catch {
        // Keep searching when an unrelated or stale PATH entry cannot be read.
      }
    }
  }
  throw new Error("Pi SDK not found");
}

const normalizeUrl = (value) => value?.replace(/\/+$/, "");

// Windows editors and PowerShell may prefix JSON files with a UTF-8 BOM.
export function parsePiJson(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

// Endpoint corrections for gaps in the installed Pi catalog. These metadata
// fields are consumed by Pi itself for both level selection and request bodies.
function nvidiaReasoningMetadata({ modelId, baseUrl }) {
  try {
    if (new URL(baseUrl).hostname !== "integrate.api.nvidia.com") return null;
  } catch { return null; }
  switch (modelId.toLowerCase()) {
    case "nvidia/nemotron-3.5-super-vl-120b-a12b":
      return { compat: { supportsReasoningEffort: false, thinkingFormat: "qwen-chat-template" } };
    // https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m3-1-flash
    case "minimaxai/minimax-m3.1-flash":
      return { compat: { supportsReasoningEffort: true, thinkingFormat: "openai" },
        thinkingLevelMap: { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" } };
    case "deepseek-ai/deepseek-v4.1-flash":
      return { compat: { supportsReasoningEffort: true, thinkingFormat: "deepseek" } };
    default: return null;
  }
}

/** Print the directory Pi uses for its model registry (models.json lives here). */
export async function printAgentDir() {
  const root = locatePi();
  const sdk = await import(pathToFileURL(join(root, "dist/index.js")).href);
  console.log(sdk.getAgentDir());
}

/** Build a model registry across Pi SDK versions (ModelRuntime is the current API). */
async function createRegistry(sdk) {
  if (typeof sdk.ModelRuntime?.create === "function") {
    const runtime = await sdk.ModelRuntime.create({ allowModelNetwork: false });
    return typeof sdk.ModelRegistry === "function" ? new sdk.ModelRegistry(runtime) : runtime;
  }
  const auth = sdk.AuthStorage?.inMemory?.();
  if (!auth || typeof sdk.ModelRegistry?.create !== "function") {
    throw new Error("Pi model registry API is unavailable");
  }
  return sdk.ModelRegistry.create(auth);
}

const UNREADABLE = "Could not read reasoning capabilities from the installed Pi SDK.";

/** Load Pi's SDK entry point and the reasoning helpers that read model metadata. */
async function loadPiRuntime() {
  const root = locatePi();
  const sdk = await import(pathToFileURL(join(root, "dist/index.js")).href);
  const scope = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name.split("/")[0];
  const aiRoots = [join(root, "node_modules", scope, "pi-ai"), join(dirname(dirname(root)), scope, "pi-ai")];
  const aiPath = aiRoots.flatMap((directory) => [join(directory, "dist/compat.js"), join(directory, "dist/index.js")]).find(existsSync);
  if (!aiPath) throw new Error("Pi reasoning helpers not found");
  return { sdk, ai: await import(pathToFileURL(aiPath).href) };
}

/** models.json mtime; 0 when the file does not exist yet. */
function modelsRevision(path) {
  try { return statSync(path).mtimeMs; } catch { return 0; }
}

/** Registry inputs: hand-written routes plus the refreshed provider catalog. */
function registryRevision(directory) {
  return `${modelsRevision(join(directory, "models.json"))}:${modelsRevision(join(directory, "models-store.json"))}`;
}

/** Resolve one lookup, registering a route on an isolated Pi provider when needed. */
async function resolveWithSetup({ sdk, ai, modelsPath, models }, input) {
  let current = models;
  let result = resolveModelReasoning(current, input, ai);
  if (result.known && !(result.provider?.startsWith("veyra-") && input.contextLength) &&
      !nvidiaReasoningMetadata(input)) {
    return { result, models: current, wrote: false };
  }
  const existing = existsSync(modelsPath) ? parsePiJson(readFileSync(modelsPath, "utf8")) : {};
  const configured = configureModelRoute(existing, input, current);
  const changed = JSON.stringify(existing) !== JSON.stringify(configured.config);
  if (changed) {
    mkdirSync(dirname(modelsPath), { recursive: true });
    const temporary = `${modelsPath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(configured.config, null, 2), { mode: 0o600 });
    renameSync(temporary, modelsPath);
    current = await (await createRegistry(sdk)).getAll();
  }
  result = resolveModelReasoning(current, { ...input, providerId: configured.provider }, ai);
  return { result, models: current, wrote: changed };
}

export async function main() {
try {
  const [providerId, modelId, baseUrl, requested, contextLength, maxTokens] = process.argv.slice(1);
  if (providerId === "__refresh_catalog__") {
    const root = locatePi();
    const sdk = await import(pathToFileURL(join(root, "dist/index.js")).href);
    if (typeof sdk.ModelRuntime?.create !== "function") throw new Error("Pi catalog refresh unavailable");
    await sdk.ModelRuntime.create({ allowModelNetwork: true, modelRefreshTimeoutMs: 8000 });
    console.log(JSON.stringify({ known: true, levels: [], message: "" }));
    return;
  }
  const { sdk, ai } = await loadPiRuntime();
  const modelsPath = join(sdk.getAgentDir(), "models.json");
  const models = await (await createRegistry(sdk)).getAll();
  const resolved = await resolveWithSetup({ sdk, ai, modelsPath, models },
    { providerId, modelId, baseUrl, requested, contextLength, maxTokens });
  console.log(JSON.stringify(resolved.result));
} catch {
  // Registry errors may contain credential/configuration details. Do not return them to the UI.
  console.log(JSON.stringify({ known: false, levels: [], message: UNREADABLE }));
}
}

/**
 * Long-lived capability worker. Importing the Pi SDK and reading its 1600-model
 * registry costs ~1.4s, so the app keeps one warm process and answers lookups
 * over JSON lines instead of paying that startup for every request.
 */
export async function serve({
  lines,
  input = process.stdin,
  output = process.stdout,
  load = loadPiRuntime,
} = {}) {
  const { sdk, ai } = await load();
  const directory = sdk.getAgentDir();
  const modelsPath = join(directory, "models.json");
  let models = await (await createRegistry(sdk)).getAll();
  let revision = registryRevision(directory);
  const send = (value) => output.write(`${JSON.stringify(value)}\n`);
  send({ ready: true, directory, models: models.length });
  const source = lines ?? (await import("node:readline")).createInterface({ input });
  for await (const line of source) {
    if (!String(line).trim()) continue;
    let request;
    try { request = JSON.parse(line); } catch { continue; }
    if (typeof request?.id !== "number") continue;
    try {
      // A refreshed catalog or an external models.json edit invalidates the
      // snapshot; rebuilding it keeps lookups fresh without an import.
      const current = registryRevision(directory);
      if (current !== revision) { models = await (await createRegistry(sdk)).getAll(); revision = current; }
      const resolved = await resolveWithSetup({ sdk, ai, modelsPath, models }, request.input ?? {});
      models = resolved.models;
      if (resolved.wrote) revision = registryRevision(directory);
      send({ id: request.id, result: resolved.result });
    } catch {
      send({ id: request.id, result: { known: false, levels: [], message: UNREADABLE } });
    }
  }
}

/** Add an isolated route so a Veyra endpoint never changes a user's Pi provider. */
export function configureModelRoute(config, { providerId, modelId, baseUrl, contextLength, maxTokens }, models = []) {
  const local = providerId === "lm-studio";
  const endpoint = normalizeUrl(baseUrl || (local ? "http://localhost:1234/v1" : ""));
  if (!endpoint || !modelId) throw new Error("Model and endpoint are required");
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid Pi configuration");
  config = structuredClone(config);
  config.providers ??= {};
  if (typeof config.providers !== "object" || Array.isArray(config.providers)) throw new Error("Invalid Pi providers");
  const hash = createHash("sha256").update(JSON.stringify([providerId, endpoint])).digest("hex").slice(0, 16);
  const provider = `veyra-${hash}`;
  const contextWindow = Math.max(1024, Math.min(262144, Number(contextLength) || 8192));
  const output = Math.max(128, Math.min(contextWindow - 128, Number(maxTokens) || Math.max(256, Math.floor(contextWindow / 4))));
  const alias = { "lm-studio": "lmstudio", "opencode-zen": "opencode" }[providerId] ?? providerId;
  const matches = models.filter((model) => !model.provider.startsWith("veyra-") &&
    (model.id === modelId || `${model.provider}/${model.id}` === modelId));
  const template = matches.find((model) => model.provider === alias) ??
    (matches.length === 1 ? matches[0] : undefined);
  // Apply documented endpoint metadata through Pi on an isolated route.
  // Keep this adapter on Veyra's isolated route, leaving user providers intact.
  const correction = nvidiaReasoningMetadata({ modelId, baseUrl: endpoint });
  const entry = config.providers[provider] ??= {
    baseUrl: endpoint, api: "openai-completions",
    apiKey: local ? "lm-studio" : "$VEYRA_PI_API_KEY",
    models: [],
  };
  if (normalizeUrl(entry.baseUrl) !== endpoint || !Array.isArray(entry.models)) throw new Error("Invalid Pi route");
  const model = {
    id: modelId, name: modelId, reasoning: correction ? true : template?.reasoning ?? true,
    input: template?.input ?? ["text"], contextWindow, maxTokens: output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: local ? { supportsDeveloperRole: false, supportsReasoningEffort: false, thinkingFormat: "qwen-chat-template" } : correction ? { ...template?.compat, ...correction.compat } : template?.compat,
    ...((correction?.thinkingLevelMap ?? template?.thinkingLevelMap) ? { thinkingLevelMap: correction?.thinkingLevelMap ?? template?.thinkingLevelMap } : {}),
  };
  const existing = entry.models.find((item) => item.id === modelId);
  if (existing) Object.assign(existing, {
    ...(contextLength ? { contextWindow } : {}), ...(maxTokens || contextLength ? { maxTokens: output } : {}),
    ...(template || correction ? { reasoning: model.reasoning, compat: model.compat, thinkingLevelMap: model.thinkingLevelMap } : {}),
  });
  else entry.models.push(model);
  return { config, provider };
}

export function resolveModelReasoning(models, { providerId, modelId, baseUrl, requested }, ai) {
  const alias = { "lm-studio": "lmstudio", "opencode-zen": "opencode" }[providerId] ?? providerId;
  const matchesId = (model) => model.id === modelId || `${model.provider}/${model.id}` === modelId;
  const matchesEndpoint = (model) => !baseUrl || normalizeUrl(model.baseUrl) === normalizeUrl(baseUrl);
  const exact = models.filter((model) => model.provider === alias && matchesId(model) && matchesEndpoint(model));
  const candidates = exact.length ? exact : baseUrl ? models.filter((model) => matchesId(model) && matchesEndpoint(model)) : [];
  if (candidates.length !== 1) return { known: false, levels: [], control: "unknown", message: "Configure this exact model and endpoint in Pi's models.json to enable reasoning controls." };
  const model = candidates[0];
  const format = model.compat?.thinkingFormat;
  const managed = model.reasoning && model.api === "openai-completions" && model.compat?.supportsReasoningEffort === false && !format;
  const mappedEfforts = Object.entries(model.thinkingLevelMap ?? {}).filter(([level, value]) => level !== "off" && value !== null);
  const hasMappedEfforts = new Set(mappedEfforts.map(([, value]) => value)).size > 1;
  const toggleOnly = !hasMappedEfforts && model.api === "openai-completions" &&
    (format === "qwen-chat-template" ||
      (["qwen", "together", "deepseek", "zai"].includes(format) && model.compat?.supportsReasoningEffort === false));
  let levels = managed ? [] : ai.getSupportedThinkingLevels(model);
  if (toggleOnly) {
    const on = levels.includes("medium") ? "medium" : levels.find((level) => level !== "off");
    levels = [...(levels.includes("off") ? ["off"] : []), ...(on ? [on] : [])];
  }
  let effectiveLevel = managed ? "off" : ai.clampThinkingLevel(model, requested || "medium");
  if (toggleOnly && effectiveLevel !== "off") effectiveLevel = levels.find((level) => level !== "off") ?? "off";
  return { known: true, provider: model.provider, model: model.id, levels, effectiveLevel,
    control: managed || !model.reasoning ? "none" : toggleOnly ? "toggle" : "effort",
    message: !model.reasoning ? "This model does not advertise reasoning support in Pi." : toggleOnly ? "This Pi adapter supports reasoning on/off, not effort levels." : "" };
}
