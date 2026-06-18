import type { ResearchClaimStatus } from "./research-types";

// ── JSON / text helpers (pure, no research state) ─────────────────────────

export function safeJsonParse<T>(text: string): T | null {
  const candidates = extractJsonCandidates(text);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  try { return JSON.stringify(error); } catch { return String(error); }
}

export function pickResearchAiOutputText(content: string, reasoning: string): string {
  const trimmedContent = content.trim();
  const trimmedReasoning = reasoning.trim();
  const looksLikeJson = (text: string) => text.includes("[") || text.includes("{");

  if (trimmedContent && looksLikeJson(trimmedContent)) return trimmedContent;
  if (!trimmedContent && trimmedReasoning) return trimmedReasoning;
  if (trimmedContent && !looksLikeJson(trimmedContent) && looksLikeJson(trimmedReasoning)) {
    return trimmedReasoning;
  }
  return trimmedContent || trimmedReasoning;
}

export function extractJsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates: string[] = [];
  const codeBlockMatches = trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi);
  for (const match of codeBlockMatches) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }
  candidates.push(trimmed);

  const balancedObject = extractBalancedJson(trimmed, "{", "}");
  if (balancedObject) candidates.push(balancedObject);
  const balancedArray = extractBalancedJson(trimmed, "[", "]");
  if (balancedArray) candidates.push(balancedArray);

  return Array.from(new Set(candidates));
}

export function extractBalancedJson(text: string, open: "{" | "[", close: "}" | "]"): string | null {
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

export function normalizeBatchVerifyArray(parsed: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object") {
    for (const key of ["results", "verifications", "items", "data", "claims"]) {
      const val = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as Array<Record<string, unknown>>;
    }
  }
  return null;
}

export function normalizeClaimStatus(value: unknown): ResearchClaimStatus {
  switch (value) {
    case "verified":
    case "partially_verified":
    case "contradicted":
    case "disputed":
    case "unverified":
    case "rejected":
      return value;
    default:
      return "unverified";
  }
}
