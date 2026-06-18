import type { ResearchClaim, ResearchEvidence, ResearchSource } from "./research-types";

// ── Claim deduplication (trigram Jaccard similarity) ──────────────────────

const CLAIM_SIMILARITY_THRESHOLD = 0.7;
const CLAIM_TRIGRAMS_CACHE_MAX = 2000;

function normalizeForTrigrams(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    out.add(padded.slice(i, i + 3));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const claimTrigramCache = new Map<string, Set<string>>();
function getClaimTrigrams(text: string): Set<string> {
  const cached = claimTrigramCache.get(text);
  if (cached) {
    claimTrigramCache.delete(text);
    claimTrigramCache.set(text, cached);
    return cached;
  }
  const tris = trigrams(normalizeForTrigrams(text));
  claimTrigramCache.set(text, tris);
  if (claimTrigramCache.size > CLAIM_TRIGRAMS_CACHE_MAX) {
    const firstKey = claimTrigramCache.keys().next().value;
    if (firstKey) claimTrigramCache.delete(firstKey);
  }
  return tris;
}

export function isSimilarToExistingClaim(newClaim: string, existing: ResearchClaim[]): boolean {
  if (existing.length === 0) return false;
  const newTris = getClaimTrigrams(newClaim);
  for (const c of existing) {
    if (jaccard(newTris, getClaimTrigrams(c.claim)) >= CLAIM_SIMILARITY_THRESHOLD) {
      return true;
    }
  }
  return false;
}

const CLAIM_SEMANTIC_REVIEW_THRESHOLD = 0.55;
export function findBorderlineSimilarClaim(newClaim: string, existing: ResearchClaim[]): ResearchClaim | null {
  if (existing.length === 0) return null;
  const newTris = getClaimTrigrams(newClaim);
  let best: { claim: ResearchClaim; score: number } | null = null;
  for (const c of existing) {
    const score = jaccard(newTris, getClaimTrigrams(c.claim));
    if (score >= CLAIM_SEMANTIC_REVIEW_THRESHOLD && score < CLAIM_SIMILARITY_THRESHOLD) {
      if (!best || score > best.score) best = { claim: c, score };
    }
  }
  return best?.claim ?? null;
}

export function clearClaimSimilarityCaches(): void {
  claimTrigramCache.clear();
  similarityTokenCache.clear();
}

// ── Topic similarity & evidence matching ───────────────────────────────────

const SIMILARITY_TOKEN_CACHE_MAX = 2000;
const SIMILARITY_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "with", "without", "for", "from",
  "into", "onto", "of", "to", "in", "on", "at", "by", "as", "is", "are", "was", "were", "be",
  "been", "being", "do", "does", "did", "done", "have", "has", "had", "this", "that", "these",
  "those", "it", "its", "they", "their", "them", "we", "our", "you", "your", "he", "she", "his",
  "her", "so", "too", "very", "just", "also", "only", "about", "over", "under", "between", "across",
  "through", "during", "before", "after", "because", "while", "when", "where", "what", "which", "who",
  "whom", "whose", "all", "any", "each", "few", "more", "most", "other", "some", "such", "same", "own",
  "per", "via", "out", "up", "down", "off", "again", "further", "once",
]);
const similarityTokenCache = new Map<string, Set<string>>();

function getSimilarityTokens(text: string): Set<string> {
  const cached = similarityTokenCache.get(text);
  if (cached) {
    similarityTokenCache.delete(text);
    similarityTokenCache.set(text, cached);
    return cached;
  }

  const tokens = normalizeForTrigrams(text)
    .split(" ")
    .filter((token) => token.length > 0)
    .filter((token) => !SIMILARITY_STOPWORDS.has(token))
    .filter((token) => token.length > 1 || /^\d+(?:\.\d+)?%?$/u.test(token));

  const set = new Set(tokens);
  similarityTokenCache.set(text, set);
  if (similarityTokenCache.size > SIMILARITY_TOKEN_CACHE_MAX) {
    const firstKey = similarityTokenCache.keys().next().value;
    if (firstKey) similarityTokenCache.delete(firstKey);
  }
  return set;
}

function normalizedTagSet(tags: readonly string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const tag of tags ?? []) {
    const normalized = normalizeForTrigrams(tag);
    if (normalized) out.add(normalized);
  }
  return out;
}

export function scoreTopicSimilarity(a: string, b: string): number {
  const tokenScore = jaccard(getSimilarityTokens(a), getSimilarityTokens(b));
  const trigramScore = jaccard(getClaimTrigrams(a), getClaimTrigrams(b));
  return (tokenScore * 0.55) + (trigramScore * 0.45);
}

export function scoreClaimEvidenceMatch(claim: ResearchClaim, claimTags: readonly string[] | undefined, evidence: ResearchEvidence, sourceById: Map<string, ResearchSource>): number {
  const topicScore = scoreTopicSimilarity(claim.claim, `${evidence.content} ${evidence.context}`);
  const tagScore = jaccard(normalizedTagSet(claimTags), normalizedTagSet(evidence.tags));
  const confidenceScore = Math.max(0, Math.min(1, evidence.confidence)) * 0.06;
  const sameSourceBonus = evidence.sourceId === claim.sourceId ? 0.08 : 0;

  // Source-type weighting: boost academic/official sources, slightly reduce spoken content
  const sourceType = sourceById.get(evidence.sourceId)?.sourceType;
  const sourceTypeBonus = sourceType === "arxiv" ? 0.04
    : sourceType === "pdf" ? 0.03
    : sourceType === "docx" || sourceType === "xlsx" || sourceType === "pptx" ? 0.03
    : sourceType === "youtube" ? -0.02
    : 0;

  return (topicScore * 0.72) + (tagScore * 0.18) + confidenceScore + sameSourceBonus + sourceTypeBonus;
}

// ── Contradiction scoring ──────────────────────────────────────────────────

function numericTokenSet(text: string): Set<string> {
  const tokens = normalizeForTrigrams(text).match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  return new Set(tokens);
}

function contradictionCueScore(a: string, b: string): number {
  const normalizedA = ` ${normalizeForTrigrams(a)} `;
  const normalizedB = ` ${normalizeForTrigrams(b)} `;

  const hasAny = (text: string, cues: readonly string[]): boolean => cues.some((cue) => text.includes(` ${cue} `));
  const opposingPair = (positive: readonly string[], negative: readonly string[]): boolean =>
    (hasAny(normalizedA, positive) && hasAny(normalizedB, negative)) ||
    (hasAny(normalizedA, negative) && hasAny(normalizedB, positive));

  let score = 0;
  if (opposingPair(["increase", "higher", "more", "rise", "grow", "improve", "effective", "works", "support", "true", "yes", "present", "enabled"], ["decrease", "lower", "less", "drop", "decline", "worse", "ineffective", "fails", "reject", "false", "no", "absent", "disabled"])) {
    score += 0.12;
  }
  if (opposingPair(["not", "never", "without", "none"], ["yes", "true", "present", "available", "possible", "exists"])) {
    score += 0.08;
  }

  const numbersA = numericTokenSet(a);
  const numbersB = numericTokenSet(b);
  if (numbersA.size > 0 && numbersB.size > 0 && jaccard(numbersA, numbersB) < 1) {
    score += 0.08;
  }

  return score;
}

export function scoreContradictionPair(a: ResearchClaim, b: ResearchClaim, evidenceById: Map<string, ResearchEvidence>): number {
  const topicScore = scoreTopicSimilarity(a.claim, b.claim);
  const evidenceA = evidenceById.get(a.evidenceId);
  const evidenceB = evidenceById.get(b.evidenceId);
  const tagScore = evidenceA && evidenceB ? jaccard(normalizedTagSet(evidenceA.tags), normalizedTagSet(evidenceB.tags)) : 0;
  return (topicScore * 0.65) + (tagScore * 0.15) + contradictionCueScore(a.claim, b.claim);
}
