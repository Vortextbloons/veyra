function extractBalancedJson(text: string, open: "{" | "[", close: "}" | "]"): string | null {
  const start = text.indexOf(open);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === open) depth++;
    else if (char === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

export function stripMarkdownJsonFence(text: string): string {
  let cleaned = text.trim();
  if (/^```(?:json)?\s*/i.test(cleaned)) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
    const closingFence = cleaned.lastIndexOf("```");
    if (closingFence !== -1) {
      cleaned = cleaned.slice(0, closingFence);
    }
  }
  return cleaned.trim();
}

function repairTrailingCommas(json: string): string {
  return json.replace(/,\s*([}\]])/g, "$1");
}

function normalizeBatchExtractArray(parsed: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["evidence", "extractions", "items", "results", "findings", "data"]) {
      const val = obj[key];
      if (Array.isArray(val)) return val as Array<Record<string, unknown>>;
    }
    if ("content" in obj || "type" in obj) {
      return [obj];
    }
  }
  return null;
}

function extractAllBalancedJsonArrays(text: string): string[] {
  const results: string[] = [];
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const sub = text.slice(searchFrom);
    const start = sub.indexOf("[");
    if (start === -1) break;
    const candidate = extractBalancedJson(sub.slice(start), "[", "]");
    if (candidate) {
      results.push(candidate);
      searchFrom += start + candidate.length;
    } else {
      searchFrom += start + 1;
    }
  }
  return results;
}

function hasUsableEvidenceContent(item: Record<string, unknown>): boolean {
  const content = item.content;
  return typeof content === "string" && content.trim().length >= 10;
}

function normalizeSalvagedEvidenceItem(item: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...item };
  if (typeof normalized.type !== "string" || !normalized.type.trim()) {
    normalized.type = "fact";
  }
  if (typeof normalized.confidence !== "number" || Number.isNaN(normalized.confidence)) {
    normalized.confidence = 0.5;
  }
  if (typeof normalized.significance !== "string" || !normalized.significance.trim()) {
    normalized.significance = "medium";
  }
  return normalized;
}

function salvageTruncatedArrayObjects(text: string): Array<Record<string, unknown>> | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  if (start === -1) return null;

  const body = trimmed.slice(start + 1);
  const objects: Array<Record<string, unknown>> = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i] ?? "")) i++;
    if (i >= body.length || body[i] !== "{") break;
    const objStr = extractBalancedJson(body.slice(i), "{", "}");
    if (!objStr) break;
    try {
      const parsed = JSON.parse(repairTrailingCommas(objStr)) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        if (hasUsableEvidenceContent(record)) {
          objects.push(normalizeSalvagedEvidenceItem(record));
        }
      }
    } catch {
      break;
    }
    i += objStr.length;
  }
  return objects.length > 0 ? objects : null;
}

function extractContentFieldFromPartialObject(fragment: string): string | null {
  const match = fragment.match(/"content"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function salvagePartialTrailingObject(body: string): Record<string, unknown> | null {
  const lastOpen = body.lastIndexOf("{");
  if (lastOpen === -1) return null;

  const fragment = body.slice(lastOpen);
  const content = extractContentFieldFromPartialObject(fragment);
  if (!content || content.trim().length < 10) return null;

  const typeMatch = fragment.match(/"type"\s*:\s*"([^"]+)"/);
  const confidenceMatch = fragment.match(/"confidence"\s*:\s*([0-9.]+)/);
  const significanceMatch = fragment.match(/"significance"\s*:\s*"([^"]+)"/);
  const sourceIndexMatch = fragment.match(/"sourceIndex"\s*:\s*([0-9]+)/);

  const item: Record<string, unknown> = {
    type: typeMatch?.[1] ?? "fact",
    content,
    confidence: confidenceMatch ? Number(confidenceMatch[1]) : 0.5,
    significance: significanceMatch?.[1] ?? "medium",
  };
  if (sourceIndexMatch) {
    item.sourceIndex = Number(sourceIndexMatch[1]);
  }
  return normalizeSalvagedEvidenceItem(item);
}

function findEvidenceArrayBody(text: string): string | null {
  const evidenceKey = text.search(/"evidence"\s*:/i);
  if (evidenceKey !== -1) {
    const afterKey = text.slice(evidenceKey);
    const arrayStart = afterKey.indexOf("[");
    if (arrayStart !== -1) {
      return afterKey.slice(arrayStart + 1);
    }
  }

  const topLevelStart = text.indexOf("[");
  if (topLevelStart !== -1) {
    return text.slice(topLevelStart + 1);
  }
  return null;
}

export function salvageEvidenceObjects(text: string): Array<Record<string, unknown>> | null {
  const fenced = stripMarkdownJsonFence(text);
  const arrayBody = findEvidenceArrayBody(fenced);
  if (!arrayBody) return null;

  const complete = salvageTruncatedArrayObjects(`[${arrayBody}`);
  const objects = complete ? [...complete] : [];

  const trailingPartial = salvagePartialTrailingObject(arrayBody);
  if (trailingPartial && hasUsableEvidenceContent(trailingPartial)) {
    const lastComplete = objects.at(-1);
    const duplicate =
      lastComplete &&
      String(lastComplete.content) === String(trailingPartial.content);
    if (!duplicate) {
      objects.push(trailingPartial);
    }
  }

  return objects.length > 0 ? objects : null;
}

export function parseResearchEvidenceArray(text: string): Array<Record<string, unknown>> | null {
  const cleaned = stripMarkdownJsonFence(stripThinkingBlocks(text));
  if (!cleaned) return null;

  const candidates: string[] = [];
  const codeBlockMatches = cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi);
  for (const match of codeBlockMatches) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }
  candidates.push(cleaned);
  for (const arr of extractAllBalancedJsonArrays(cleaned)) {
    candidates.push(arr);
  }
  const balancedObject = extractBalancedJson(cleaned, "{", "}");
  if (balancedObject) candidates.push(balancedObject);

  for (const candidate of Array.from(new Set(candidates))) {
    for (const attempt of [candidate, repairTrailingCommas(candidate)]) {
      try {
        const parsed = JSON.parse(attempt) as unknown;
        if (Array.isArray(parsed)) {
          return parsed as Array<Record<string, unknown>>;
        }
        const normalized = normalizeBatchExtractArray(parsed);
        if (normalized) return normalized;
      } catch {
        // Try the next candidate.
      }
    }
  }

  const salvaged = salvageEvidenceObjects(cleaned);
  if (salvaged) return salvaged;

  if (/\[\s*\]/.test(cleaned) || /"evidence"\s*:\s*\[\s*\]/.test(cleaned)) {
    return [];
  }

  return null;
}

export function maxEvidenceItemsPerSource(batchSourceCount: number): number {
  return Math.min(3, Math.max(1, 5 - batchSourceCount));
}

export function isLikelyTruncatedJsonResponse(text: string): boolean {
  const cleaned = stripMarkdownJsonFence(stripThinkingBlocks(text)).trim();
  if (!cleaned) return false;
  if (cleaned.endsWith("}") || cleaned.endsWith("]")) return false;
  return cleaned.includes("{") || cleaned.includes("[");
}
