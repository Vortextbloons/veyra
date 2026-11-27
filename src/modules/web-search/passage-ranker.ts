import type { SearchPassage } from "./types";

const MAX_PASSAGE_CHARS = 1_500;
const MIN_PASSAGE_CHARS = 25;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "about",
  "what", "who", "when", "where", "why", "how", "are", "was", "were",
  "can", "does", "did", "will", "has", "have", "had", "not", "but",
  "you", "your", "its", "their", "they", "there", "here", "which",
]);

function terms(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
}

function queryKeyTerms(query: string): Set<string> {
  const all = terms(query);
  const filtered = new Set([...all].filter((term) => !STOPWORDS.has(term)));
  return filtered.size > 0 ? filtered : all;
}

function lexicalScore(query: Set<string>, normalizedPhrase: string, text: string): number {
  if (query.size === 0) return 0;
  const candidate = terms(text);
  let matches = 0;
  for (const term of query) if (candidate.has(term)) matches++;
  const base = matches / query.size;
  const phraseBoost =
    normalizedPhrase.includes(" ") && text.toLowerCase().includes(normalizedPhrase)
      ? 0.25
      : 0;
  return base + phraseBoost;
}

export function rankSearchPassages(
  sourceId: string,
  content: string,
  query: string,
  limit = 3,
): SearchPassage[] {
  const queryTerms = queryKeyTerms(query);
  const normalizedPhrase = query.trim().toLowerCase().replace(/\s+/g, " ");
  const passages: SearchPassage[] = [];
  let heading: string | undefined;
  const blocks = content.split(/\n{2,}/);
  let searchFrom = 0;
  let pendingShort = "";
  let pendingStart = -1;

  const pushBlock = (block: string, blockStart: number) => {
    for (let offset = 0; offset < block.length; offset += MAX_PASSAGE_CHARS) {
      const text = block.slice(offset, offset + MAX_PASSAGE_CHARS).trim();
      if (text.length < MIN_PASSAGE_CHARS) continue;
      const score = lexicalScore(queryTerms, normalizedPhrase, `${heading ?? ""} ${text}`);
      if (text.length < 80 && score === 0) continue;
      passages.push({
        sourceId,
        ...(heading ? { heading } : {}),
        text,
        ...(blockStart >= 0 ? {
          startOffset: blockStart + offset,
          endOffset: blockStart + offset + text.length,
        } : {}),
        lexicalScore: score,
        finalScore: score,
      });
    }
  };

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;
    const rawIndex = content.indexOf(rawBlock, searchFrom);
    const startOffset = rawIndex >= 0 ? rawIndex : searchFrom;
    searchFrom = Math.max(searchFrom, startOffset + rawBlock.length);

    if (/^#{1,6}\s+/.test(block) && block.length < 200) {
      if (pendingShort) {
        pushBlock(pendingShort, pendingStart);
        pendingShort = "";
        pendingStart = -1;
      }
      heading = block.replace(/^#{1,6}\s+/, "").trim();
      continue;
    }

    const combined = pendingShort ? `${pendingShort}\n\n${block}` : block;
    const combinedStart = pendingShort ? pendingStart : startOffset;
    if (combined.length < 80) {
      pendingShort = combined;
      pendingStart = combinedStart;
      continue;
    }

    pendingShort = "";
    pendingStart = -1;
    pushBlock(combined, combinedStart);
  }

  if (pendingShort) {
    pushBlock(pendingShort, pendingStart);
  }

  return passages
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);
}
