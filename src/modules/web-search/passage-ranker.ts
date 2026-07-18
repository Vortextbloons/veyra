import type { SearchPassage } from "./types";

const MAX_PASSAGE_CHARS = 1_600;

function terms(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
}

function lexicalScore(query: Set<string>, text: string): number {
  if (query.size === 0) return 0;
  const candidate = terms(text);
  let matches = 0;
  for (const term of query) if (candidate.has(term)) matches++;
  return matches / query.size;
}

export function rankSearchPassages(
  sourceId: string,
  content: string,
  query: string,
  limit = 3,
): SearchPassage[] {
  const queryTerms = terms(query);
  const passages: SearchPassage[] = [];
  let heading: string | undefined;
  const blocks = content.split(/\n{2,}/);
  let searchFrom = 0;

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;
    if (/^#{1,6}\s+/.test(block) && block.length < 200) {
      heading = block.replace(/^#{1,6}\s+/, "").trim();
      continue;
    }
    const startOffset = content.indexOf(rawBlock, searchFrom);
    searchFrom = Math.max(searchFrom, startOffset + rawBlock.length);
    for (let offset = 0; offset < block.length; offset += MAX_PASSAGE_CHARS) {
      const text = block.slice(offset, offset + MAX_PASSAGE_CHARS).trim();
      if (text.length < 80) continue;
      const score = lexicalScore(queryTerms, `${heading ?? ""} ${text}`);
      passages.push({
        sourceId,
        ...(heading ? { heading } : {}),
        text,
        ...(startOffset >= 0 ? {
          startOffset: startOffset + offset,
          endOffset: startOffset + offset + text.length,
        } : {}),
        lexicalScore: score,
        finalScore: score,
      });
    }
  }

  return passages
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);
}
