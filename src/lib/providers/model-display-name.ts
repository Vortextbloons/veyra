const TOKEN_NAMES: Record<string, string> = {
  ai: "AI",
  api: "API",
  codex: "Codex",
  coder: "Coder",
  deepseek: "DeepSeek",
  fp8: "FP8",
  glm: "GLM",
  gpt: "GPT",
  kimi: "Kimi",
  llama: "Llama",
  llm: "LLM",
  mimo: "MiMo",
  mixtral: "Mixtral",
  nemotron: "Nemotron",
  qwen: "Qwen",
  vl: "VL",
};

function formatToken(token: string): string {
  const lower = token.toLowerCase();
  if (TOKEN_NAMES[lower]) return TOKEN_NAMES[lower];
  if (/^v\d/i.test(token)) return `V${token.slice(1)}`;
  if (/^\d+(?:\.\d+)?b$/i.test(token)) return token.toUpperCase();
  if (/^\d{4}(?:\d{2}){1,2}$/.test(token)) return token;
  return token ? token[0].toUpperCase() + token.slice(1) : token;
}

/** Turns API identifiers such as `deepseek-ai/deepseek-v4` into compact UI labels. */
export function formatModelDisplayName(modelId: string, providerName?: string): string {
  const supplied = providerName?.trim();
  const source = supplied && supplied.toLowerCase() !== modelId.toLowerCase()
    ? supplied
    : modelId.split("/").at(-1) ?? modelId;
  return source
    .replace(/[_\s]+/g, "-")
    .split("-")
    .filter(Boolean)
    .map(formatToken)
    .join(" ");
}

