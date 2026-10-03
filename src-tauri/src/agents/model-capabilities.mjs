// Read-only bridge to the same installed Pi registry and reasoning helpers used by its CLI.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

function locatePi() {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    for (const executable of process.platform === "win32" ? ["pi.cmd", "pi"] : ["pi"]) {
      const bin = join(directory, executable);
      if (!existsSync(bin)) continue;
      const real = realpathSync(bin);
      const direct = join(dirname(dirname(real)), "package.json");
      if (existsSync(direct)) {
        const name = JSON.parse(readFileSync(direct, "utf8")).name;
        if (name?.endsWith("/pi-coding-agent")) return dirname(direct);
      }
      const wrapper = readFileSync(bin, "utf8");
      const match = wrapper.match(/node_modules[\\/](@[^\\/]+[\\/]pi-coding-agent)[\\/]/);
      if (match) {
        const root = join(directory, "node_modules", ...match[1].split(/[\\/]/));
        if (existsSync(join(root, "package.json"))) return root;
      }
    }
  }
  throw new Error("Pi SDK not found");
}

const normalizeUrl = (value) => value?.replace(/\/+$/, "");
export async function main() {
try {
  const [providerId, modelId, baseUrl, requested] = process.argv.slice(1);
  const root = locatePi();
  const sdk = await import(pathToFileURL(join(root, "dist/index.js")).href);
  const scope = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name.split("/")[0];
  const aiRoots = [join(root, "node_modules", scope, "pi-ai"), join(dirname(dirname(root)), scope, "pi-ai")];
  const aiPath = aiRoots.flatMap((directory) => [join(directory, "dist/compat.js"), join(directory, "dist/index.js")]).find(existsSync);
  if (!aiPath) throw new Error("Pi reasoning helpers not found");
  const ai = await import(pathToFileURL(aiPath).href);
  const auth = sdk.AuthStorage.inMemory();
  const registry = sdk.ModelRegistry.create(auth);
  const models = await registry.getAll();
  console.log(JSON.stringify(resolveModelReasoning(models, { providerId, modelId, baseUrl, requested }, ai)));

} catch {
  // Registry errors may contain credential/configuration details. Do not return them to the UI.
  console.log(JSON.stringify({ known: false, levels: [], message: "Could not read reasoning capabilities from the installed Pi SDK." }));
}

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
  const toggleOnly = model.api === "openai-completions" && (["qwen", "qwen-chat-template", "together"].includes(format) || (["deepseek", "zai"].includes(format) && model.compat?.supportsReasoningEffort === false));
  let levels = managed ? [] : ai.getSupportedThinkingLevels(model);
  if (toggleOnly) {
    const on = levels.includes("medium") ? "medium" : levels.find((level) => level !== "off");
    levels = [...(levels.includes("off") ? ["off"] : []), ...(on ? [on] : [])];
  }
  let effectiveLevel = managed ? "off" : ai.clampThinkingLevel(model, requested || "medium");
  if (toggleOnly && effectiveLevel !== "off") effectiveLevel = levels.find((level) => level !== "off") ?? "off";
  return { known: true, provider: model.provider, model: model.id, levels, effectiveLevel,
    control: managed || !model.reasoning ? "none" : toggleOnly ? "toggle" : "effort",
    message: managed ? "Reasoning is managed by this endpoint; no reasoning control is configured in Pi." : !model.reasoning ? "This model does not advertise reasoning support in Pi." : toggleOnly ? "This Pi adapter supports reasoning on/off, not effort levels." : "" };
}
